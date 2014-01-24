//test runner, based on protractor

var util = require('util'),
  fs = require('fs'),
  path = require('path'),
  glob = require('glob'),
  remote = require('selenium-webdriver/remote'),
  chrome = require('selenium-webdriver/chrome'),
  adapters = require('selenium-selenium-webdriver/testing'),
  Mocha = require('mocha'),
  Browser = require('./browser');

var server,
  driver,
  mocha,
  defaultConfig = {
    configDir: './defaultConfig',

    seleniumServerJar: null,
    seleniumArgs: [],
    seleniumPort: null,
    seleniumAddress: null,

    scriptsTimeout: 10000,

    capabilities: {
      browserName: 'chrome'
    },

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
function extendConfig(config) {
  // All filepaths should be kept relative to the current config location.
  // This will not affect absolute paths.
  ['seleniumServerJar', 'chromeDriver'].forEach(function(name) {
    if (config[name] && config.configDir && typeof config[name] === 'string') {
      config[name] = path.resolve(config.configDir, config[name]);
    }
  });
  merge(config, config);
}

/**
 * Sets up the Selenium server and returns a promise once the server is ready to go. After this function is called,
 * defaultConfig.seleniumAddress and defaultConfig.capabilities are set up.
 * @return {webdriver.promise.Promise.<string>} A promise which resolves to the value of the selenium address
 *     that will be used.
 */
function setupSelenium() {
  var dfd = webdriver.promise.defer(),
    defaultChromedriver;

  if (defaultConfig.chromeDriver) {
    if (!fs.existsSync(defaultConfig.chromeDriver)) {
      if (fs.existsSync(defaultConfig.chromeDriver + '.exe')) {
        defaultConfig.chromeDriver += '.exe';
      } else {
        throw new Error('Could not find chromedriver at ' + defaultConfig.chromeDriver);
      }
    }
  } else {
    defaultChromedriver = path.resolve(__dirname, '../selenium/chromedriver');
    if (fs.existsSync(defaultChromedriver)) {
      defaultConfig.chromeDriver = defaultChromedriver;
    } else if (fs.existsSync(defaultChromedriver + '.exe')) {
      defaultConfig.chromeDriver = defaultChromedriver + '.exe';
    }
  }

  if (defaultConfig.chromeOnly) {
    util.puts('Using ChromeDriver directly...');
    dfd.fulfill(null);
  } else if (defaultConfig.seleniumAddress) {
    util.puts('Using the selenium server at ' + defaultConfig.seleniumAddress);
    dfd.fulfill(defaultConfig.seleniumAddress);
  } else {
    util.puts('Starting selenium standalone server...');

    if (!defaultConfig.seleniumServerJar) {
      // Try to use the default location.
      var defaultStandalone = path.resolve(__dirname,
        '../selenium/selenium-server-standalone-' + require('../package.json').webdriverVersions.selenium + '.jar');
      if (!fs.existsSync(defaultStandalone)) {
        throw new Error('Unable to start selenium. You must specify either a seleniumAddress, seleniumServerJar, ' +
          'or use webdriver-manager.');
      } else {
        defaultConfig.seleniumServerJar = defaultStandalone;
      }
    } else if (!fs.existsSync(defaultConfig.seleniumServerJar)) {
      throw new Error('there\'s no selenium server jar at the specified location. Do you have the correct version?');
    }

    if (defaultConfig.chromeDriver) {
      defaultConfig.seleniumArgs.push('-Dwebdriver.chrome.driver=' + defaultConfig.chromeDriver);
    }

    server = new remote.SeleniumServer(defaultConfig.seleniumServerJar, {
      args: defaultConfig.seleniumArgs,
      port: defaultConfig.seleniumPort
    });

    server.start().then(function(url) {
      util.puts('Selenium standalone server started at ' + url);
      defaultConfig.seleniumAddress = server.address();
      dfd.fulfill(defaultConfig.seleniumAddress);
    });
  }
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
  var specs = defaultConfig.specs,
    resolvedSpecs = [];

  for (var i = 0; i < specs.length; ++i) {
    var matches = glob.sync(specs[i], {cwd: defaultConfig.configDir});
    if (!matches.length) {
      util.puts('Warning: pattern ' + specs[i] + ' did not match any files.');
    }
    for (var j = 0; j < matches.length; ++j) {
      resolvedSpecs.push(path.resolve(defaultConfig.configDir, matches[j]));
    }
  }
  if (!resolvedSpecs.length) {
    throw new Error('Spec patterns did not match any files.');
  }

  var dfd = webdriver.promise.defer();

  if (defaultConfig.chromeOnly) {
    var service = new chrome.ServiceBuilder(defaultConfig.chromeDriver).build();
    driver = chrome.createDriver(
      new webdriver.Capabilities(defaultConfig.capabilities), service);
  } else {
    driver = new webdriver.Builder().
      usingServer(defaultConfig.seleniumAddress).
      withCapabilities(defaultConfig.capabilities).build();
  }

  driver.manage().timeouts().setScriptTimeout(defaultConfig.scriptsTimeout);

  var browser = Browser.wrap(driver, defaultConfig.baseUrl);
  Browser.setInstance(browser);

  global.browser = browser;
  global.$ = browser.$;
  global.element = browser.element;

  mocha = new Mocha(defaultConfig.mochaOpts);
  resolvedSpecs.forEach(mocha.addFile.bind(mocha));

  // Mocha doesn't set up the ui until the pre-require event, so
  // wait until then to load mocha-webdriver adapters as well.
  mocha.suite.on('pre-require', function() {
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
  });
  mocha.loadFiles();

  webdriver.promise.controlFlow().execute(function() {
    mocha.run(function(failures) {
      driver.quit().then(function() {
        dfd.fulfill(failures);
      });
    });
  });

  return dfd.promise;
}

function runOnce() {
  var specs = defaultConfig.specs;

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
