//test runner, based on protractor

var util = require('util'),
  fs = require('fs'),
  path = require('path'),
  remote = require('selenium-webdriver/remote');

var server,
  defaultConfig = {
    defaultConfigDir: './defaultConfig',

    seleniumServerJar: null,
    seleniumArgs: [],
    seleniumPort: null,
    seleniumAddress: null,

    scriptsTimeout: 10000,

    browsers: {
      chrome: {
        'browserName': 'chrome'
      }
    },

    mochaOpts: {
      ui: 'bdd',
      reporter: 'spec'
    }
  };

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
