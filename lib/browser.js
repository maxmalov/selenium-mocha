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
    if (setupFn) {
      setupFn();
    }
    return from[fnName].apply(from, arguments);
  };
}

function Browser(webdriver, baseUrl) {

  //mix webdriver functionality into this
  for (var method in webdriver) {
    if(!this[method] && typeof webdriver[method] == 'function') {
      mixin(this, webdriver, method);
    }
  }

  this.driver = webdriver;
  this.baseUrl = baseUrl;
}

/**
 * Open the specified url
 * @param url
 * @returns {!webdriver.promise.Promise}
 */
Browser.prototype.open = function (url) {
  return this.driver.get(this.baseUrl + url);
}

/**
 * Refresh the underlying page
 * @returns {!webdriver.promise.Promise}
 */
Browser.prototype.refresh = function () {
  return this.driver.executeScript('location.reload();');
}

exports.wrap = function (webdriver, baseUrl) {
  return new Browser(webdriver, baseUrl);
}

var inst;

exports.setInstance = function (instance) {
  inst = instance;
}

exports.getInstance = function () {
  return inst;
}

exports.element = function () {
  if (!inst) {
    throw new Error('Browser instance is undefined');
  }
  return inst.findElement.apply(inst, arguments);
}

exports.$element = function (css) {
  return exports.element({css: css});
}