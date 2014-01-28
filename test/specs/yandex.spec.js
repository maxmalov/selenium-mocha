describe('Yandex search', function () {

  beforeEach(function () {
    $('.b-morda-search__input input[name=text]').sendKeys('Hey!');
    $('.b-morda-search__button input[type=submit]').click();
  });

  ignore.browsers('chrome').
  it('should search', function () {
    browser.wait(function () {
      return browser.getTitle().then(function (title) {
        return /^Hey!/.test(title);
      });
    });
  });
});

