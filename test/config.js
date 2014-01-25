module.exports = {
  specs: [ 'specs/*.js' ],

  mochaOpts: {
    slow: 2000,
    reporter: 'list'
  },

  beforeStart: function () {
    browser.open('http://yandex.ru');
  }
};
