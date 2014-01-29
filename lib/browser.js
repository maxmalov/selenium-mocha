//export selenium webdriver namespace
exports.selenium = require('selenium-webdriver');

/**
 * Mix a function from one object onto another. The function will still be
 * called in the context of the original object.
 *
 * @private
 * @param {Object} to
 * @param {Object} from
 * @param {string} fnName
 */
function mixin(to, from, fnName) {
  to[fnName] = function() {
    return from[fnName].apply(from, arguments);
  };
}

function Browser(name, webdriver, baseUrl) {
  //mix webdriver functionality into this
  for (var method in webdriver) {
    if(!this[method] && typeof webdriver[method] == 'function') {
      mixin(this, webdriver, method);
    }
  }

  this.name = name;
  this.driver = webdriver;
  this.baseUrl = baseUrl || '';
}

/**
 * Open the specified url
 * @param url
 * @returns {!webdriver.promise.Promise}
 */
Browser.prototype.open = function (url) {
  return this.driver.get(this.baseUrl + url);
};

/**
 * Refresh the underlying page
 * @returns {!webdriver.promise.Promise}
 */
Browser.prototype.refresh = function () {
  return this.driver.executeScript('location.reload();');
};

Browser.prototype.waitForElement = function (locator, timeout) {
  var driver = this.driver;
  return driver.wait(function () {
    return driver.isElementPresent(locator);
  }, timeout || 5000, 'Element was\'t found');
};

/**
 * Determines whether browser name is in the specified list
 * @returns {boolean}
 */
Browser.prototype.is = function () {
  var args = Array.prototype.slice.call(arguments);
  return args.indexOf(this.name) !== -1;
};

var inst;

exports.get = function (name, webdriver, baseUrl) {
  if (arguments.length === 3) {
    inst = new Browser(name, webdriver, baseUrl);
    inst.fn = Browser.prototype;
  } else if (!inst) {
    throw new Error('Browser instance is undefined.');
  }
  return inst;
}

exports.element = function () {
  if (!inst) {
    throw new Error('Browser instance is undefined');
  }
  return inst.findElement.apply(inst, arguments);
};

exports.$ = function (css) {
  return exports.element({css: css});
};
