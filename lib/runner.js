//test runner, based on protractor

var util = require('util'),
  fs = require('fs'),
  path = require('path'),
  glob = require('glob'),
  webdriver = require('selenium-webdriver'),
  remote = require('selenium-webdriver/remote'),
  chrome = require('selenium-webdriver/chrome'),
  Mocha = require('mocha'),
  Browser = require('./browser');

var server,
  driver,
  mocha,
  config = {
    configDir: './config',

    seleniumServerJar: null,
    seleniumArgs: [],
    seleniumPort: null,
    seleniumAddress: null,

    scriptsTimeout: 10000,

    capabilities: {
      browserName: 'chrome'
    },

    params: {},

    mochaOpts: {
      ui: 'bdd',
      reporter: 'spec'
    }
  };

/**
 * Merge config objects together.
 * @param {Object} into
 * @param {Object} from
 * @return {Object} The 'into' config.
 */
function merge(into, from) {
  for (var key in from) {
    if (into[key] instanceof Object && !(into[key] instanceof Array)) {
      merge(into[key], from[key]);
    } else {
      into[key] = from[key];
    }
  }
  return into;
}

/**
 * Add the options in the parameter config to this runner instance.
 * @param {Object} config
 */
function extendConfig(additionalConfig) {
  // All filepaths should be kept relative to the current config location.
  // This will not affect absolute paths.
  ['seleniumServerJar', 'chromeDriver', 'beforeStart'].forEach(function(name) {
    if (additionalConfig[name] && additionalConfig.configDir && typeof additionalConfig[name] === 'string') {
      additionalConfig[name] = path.resolve(additionalConfig.configDir, additionalConfig[name]);
    }
  });
  merge(config, additionalConfig);
}

/**
 * Sets up the Selenium server and returns a promise once the server is ready to go. After this function is called,
 * config.seleniumAddress and config.capabilities are set up.
 * @return {webdriver.promise.Promise.<string>} A promise which resolves to the value of the selenium address
 *     that will be used.
 */
function setupSelenium() {
  var dfd = webdriver.promise.defer(),
    defaultChromedriver;

  if (config.chromeDriver) {
    if (!fs.existsSync(config.chromeDriver)) {
      if (fs.existsSync(config.chromeDriver + '.exe')) {
        config.chromeDriver += '.exe';
      } else {
        throw new Error('Could not find chromedriver at ' + config.chromeDriver);
      }
    }
  } else {
    defaultChromedriver = path.resolve(__dirname, '../selenium/chromedriver');
    if (fs.existsSync(defaultChromedriver)) {
      config.chromeDriver = defaultChromedriver;
    } else if (fs.existsSync(defaultChromedriver + '.exe')) {
      config.chromeDriver = defaultChromedriver + '.exe';
    }
  }

  if (config.chromeOnly) {
    util.puts('Using ChromeDriver directly...');
    dfd.fulfill(null);
  } else if (config.seleniumAddress) {
    util.puts('Using the selenium server at ' + config.seleniumAddress);
    dfd.fulfill(config.seleniumAddress);
  } else {
    util.puts('Starting selenium standalone server...');

    if (!config.seleniumServerJar) {
      // Try to use the default location.
      var defaultStandalone = path.resolve(__dirname,
        '../selenium/selenium-server-standalone-' + require('../package.json').webdriverVersions.selenium + '.jar');
      if (!fs.existsSync(defaultStandalone)) {
        throw new Error('Unable to start selenium. You must specify either a seleniumAddress, seleniumServerJar, ' +
          'or use webdriver-manager.');
      } else {
        config.seleniumServerJar = defaultStandalone;
      }
    } else if (!fs.existsSync(config.seleniumServerJar)) {
      throw new Error('there\'s no selenium server jar at the specified location. Do you have the correct version?');
    }

    if (config.chromeDriver) {
      config.seleniumArgs.push('-Dwebdriver.chrome.driver=' + config.chromeDriver);
    }

    server = new remote.SeleniumServer(config.seleniumServerJar, {
      args: config.seleniumArgs,
      port: config.seleniumPort
    });

    server.start().then(function(url) {
      util.puts('Selenium standalone server started at ' + url);
      config.seleniumAddress = server.address();
      dfd.fulfill(config.seleniumAddress);
    });
  }

  return dfd.promise;
}

/**
 * Cleans up the driver and selenium server
 * @param {number} failures
 */
function cleanupSelenium(failures) {
  var exitCode = (failures === 0) ? 0 : 1;
  if (server) {
    util.puts('Shutting down selenium standalone server.');
    server.stop().then(function() {
      process.exit(exitCode);
    });
  } else {
    process.exit(exitCode);
  }
}

/**
 * Run the tests.
 * @return {webdriver.promise.Promise} A promise that will resolve when the test run is finished.
 */
function runSpecs() {
  var specs = config.specs,
    resolvedSpecs = [];

  for (var i = 0; i < specs.length; ++i) {
    var matches = glob.sync(specs[i], {cwd: config.configDir});
    if (!matches.length) {
      util.puts('Warning: pattern ' + specs[i] + ' did not match any files.');
    }
    for (var j = 0; j < matches.length; ++j) {
      resolvedSpecs.push(path.resolve(config.configDir, matches[j]));
    }
  }
  if (!resolvedSpecs.length) {
    throw new Error('Spec patterns did not match any files.');
  }

  var dfd = webdriver.promise.defer();

  if (config.chromeOnly) {
    var service = new chrome.ServiceBuilder(config.chromeDriver).build();
    driver = chrome.createDriver(
      new webdriver.Capabilities(config.capabilities), service);
  } else {
    driver = new webdriver.Builder().
      usingServer(config.seleniumAddress).
      withCapabilities(config.capabilities).build();
  }

  driver.manage().timeouts().setScriptTimeout(config.scriptsTimeout);

  var browser = Browser.get(config.capabilities.browserName, driver, config.baseUrl);
  browser.params = config.params;

  global.browser = browser;
  global.$ = Browser.$;
  global.element = Browser.element;

  mocha = new Mocha(config.mochaOpts);
  resolvedSpecs.forEach(mocha.addFile.bind(mocha));

  // Mocha doesn't set up the ui until the pre-require event, so
  // wait until then to load mocha-webdriver adapters as well.
  mocha.suite.on('pre-require', function() {
    var adapters = require('selenium-webdriver/testing');

    global.describe = adapters.describe;
    global.describe.skip = global.xdescribe = adapters.xdescribe;
    global.describe.only = global.ddescribe = adapters.describe.only;

    global.after = adapters.after;
    global.afterEach = adapters.afterEach;
    global.before = adapters.before;
    global.beforeEach = adapters.beforeEach;

    global.it = adapters.it;
    global.it.skip = global.xit = adapters.xit;
    global.it.only = global.iit = adapters.it.only;

    global.ignore = adapters.ignore;
    global.ignore.browsers = function () {
      var args = Array.prototype.slice.call(arguments);
      return global.ignore(function () {
        return global.browser.is.apply(global.browser, args);
      });
    }
  });
  mocha.loadFiles();

  webdriver.promise.controlFlow().on('uncaughtException', function(err) {
    console.log('There was an uncaught exception: ' + err);
    browser.quit();
    cleanupSelenium(err);
  });

  webdriver.promise.controlFlow().execute(function () {
    if (config.beforeStart) {
      if (typeof config.beforeStart === 'function') {
        config.beforeStart();
      } else if (typeof config.beforeStart === 'string') {
        require(path.resolve(config.configDir, config.beforeStart));
      } else {
        throw new Error('config.beforeStart must be a string or function');
      }
    }
  }).then(function() {
    mocha.run(function(failures) {
      driver.quit().then(function() {
        dfd.fulfill(failures);
      });
    });
  });

  return dfd.promise;
}

function runOnce() {
  var specs = config.specs;

  if (!specs || specs.length === 0) {
    util.puts('No spec files found');
    process.exit(0);
  }

  return setupSelenium().then(function () {
    return runSpecs().then(cleanupSelenium);
  });
}

exports.runOnce = runOnce;
exports.extendConfig = extendConfig;
