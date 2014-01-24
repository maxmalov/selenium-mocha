var util = require('util'),
  path = require('path'),
  fs = require('fs'),
  runner = require('./runner.js');

var argv = require('optimist')
  .usage('Usage: selenium-mocha [options] [configFile]\n' +
    'The [options] object will override values from the config file.\n' +
    'See the reference config for a full list of options.')
  .describe('help', 'Print help menu')
  .describe('version', 'Print version')
  .describe('browser', 'Browser name, e.g. chrome or firefox')
  .describe('seleniumAddress', 'A running selenium address to use')
  .describe('seleniumServerJar', 'Location of the standalone selenium jar file')
  .describe('seleniumPort', 'Optional port for the selenium standalone server')
  .describe('baseUrl', 'URL to prepend to all relative paths')
  .describe('specs', 'Comma-separated list of files to test')
  .alias('browser', 'capabilities.browserName')
  .alias('name', 'capabilities.name')
  .alias('platform', 'capabilities.platform')
  .alias('platform-version', 'capabilities.version')
  .alias('tags', 'capabilities.tags')
  .alias('build', 'capabilities.build')
  .string('capabilities.tunnel-identifier')
  .check(function(arg) {
    if (arg._.length > 1) {
      throw 'Error: more than one config file specified';
    }
    if (process.argv.length < 3 || arg.help) {
      throw new Error('');
    }
  }).argv;

if (argv.version) {
  util.puts('Version ' + JSON.parse(
    fs.readFileSync(__dirname + '/../package.json', 'utf8')).version);
  process.exit(0);
}

// Any file names should be resolved relative to the current working directory.
if (argv.specs) {
  argv.specs = argv.specs.split(',');
  argv.specs.forEach(function(spec, index, arr) {
    arr[index] = path.resolve(process.cwd(), spec);
  });
}
['seleniumServerJar', 'chromeDriver'].forEach(function(name) {
  if (argv[name]) {
    argv[name] = path.resolve(process.cwd(), argv[name]);
  }
});

var configFilename = argv._[0];
if (configFilename) {
  var configPath = path.resolve(process.cwd(), configFilename);
  var config = require(configPath).config;
  config.configDir = path.dirname(configPath);
  runner.extendConfig(config);
}
runner.extendConfig(argv);
runner.runOnce();
