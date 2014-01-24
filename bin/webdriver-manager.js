#!/usr/bin/env node

//based on protractor webdriver-manager

var os = require('os'),
  fs = require('fs'),
  path = require('path'),
  optimist = require('optimist'),
  mkdirp = require('mkdirp'),
  url = require('url'),
  AdmZip = require('adm-zip'),
  http = require('http'),
  childProcess = require('child_process');

var SELENIUM_DIR = path.resolve(__dirname, '../selenium'),
  versions = require('../package.json').webdriverVersions;

var binaries = {
  standalone: {
    name: 'selenium standalone',
    isDefault: true,
    prefix: 'selenium-server-standalone',
    filename: 'selenium-server-standalone-' + versions.selenium + '.jar',
    url: function () {
      return 'https://selenium.googlecode.com/files/selenium-server-standalone-' +
        versions.selenium + '.jar';
    }
  },
  chrome: {
    name: 'chromedriver',
    isDefault: true,
    prefix: 'chromedriver_',
    filename: 'chromedriver_' + versions.chromedriver + '.zip',
    url: function() {
      var urlPrefix = 'https://chromedriver.storage.googleapis.com/' +
        versions.chromedriver + '/chromedriver_';

      switch (os.type()) {
        case 'Darwin':
          return urlPrefix + 'mac32.zip';
        case 'Linux':
          return os.arch() === 'x64' ?
            urlPrefix + 'linux64.zip' :
            urlPrefix + 'linux32.zip';
        default:
          return urlPrefix + 'win32.zip';
      }
    }
  },
  ie: {
    name: 'iedriver',
    isDefault: false,
    prefix: 'iedriverServer',
    filename: 'iedriverServer_' + versions.iedriver + '.zip',
    url: function () {
      var urlPrefix = 'https://selenium.googlecode.com/files/iedriverServer';
      if (os.type() == 'Windows_NT') {
        if (os.arch() == 'x64') {
          return urlPrefix + '_x64_' + versions.iedriver + '.zip';
        } else {
          return urlPrefix + '_win32_' + versions.iedriver + '.zip';
        }
      }
    }
  }
};

var cli = optimist.usage(
      'Usage: webdriver-manager <command>\n' +
        'Commands:\n' +
        '  update: install or update selected binaries\n' +
        '  start: start up the selenium server\n' +
        '  status: list the current available drivers'
    ).describe('outDir', 'Location to output/expect ')
    .default('outDir', SELENIUM_DIR)
    .describe('seleniumPort', 'Optional port for the selenium standalone server'),
  bin;

for (bin in binaries) {
  cli.describe(bin, 'install or update ' + binaries[bin].name)
    .boolean(bin)
    .default(bin, binaries[bin].isDefault);
}

var argv = cli.check(function (arg) {
  if (arg._.length != 1) {
    throw 'Please specify one command';
  }
}).argv;
mkdirp.sync(argv.outDir);

/**
 * Function to download file using HTTP.get.
 * Thanks to http://www.hacksparrow.com/using-node-js-to-download-files.html
 * for the outline of this code.
 */
var httpGetFile = function (fileUrl, fileName, outputDir, callback) {
  console.log('downloading ' + fileUrl + '...');
  var options = {
    host: url.parse(fileUrl).host,
    port: 80,
    path: url.parse(fileUrl).pathname
  };

  var filePath = path.join(outputDir, fileName);
  var file = fs.createWriteStream(filePath);

  http.get(options, function (res) {
    res.on('data',function (data) {
        file.write(data);
      })
      .on('end', function () {
        file.end(function () {
          console.log(fileName + ' downloaded to ' + filePath);
          if (callback) {
            callback(filePath);
          }
        });
      });
  });
};

/**
 * Normalize a command across OS
 */
var spawnCommand = function (command, args) {
  var win32 = process.platform === 'win32';
  var winCommand = win32 ? 'cmd' : command;
  var finalArgs = win32 ? ['/c'].concat(command, args) : args;

  return childProcess.spawn(winCommand, finalArgs,
    { stdio: 'inherit' });
};

/**
 * If a new version of the file with the given url exists, download and
 * delete the old version.
 */
var downloadIfNew = function (bin, outputDir, existingFiles, opt_callback) {
  if (!bin.exists) {
    // Remove anything else that matches the exclusive prefix.
    existingFiles.forEach(function (file) {
      if (file.indexOf(bin.prefix) != -1) {
        fs.unlinkSync(path.join(outputDir, file));
      }
    });
    console.log('Updating ' + bin.name);
    var url = bin.url();
    if (!url) {
      console.error(bin.name + ' is not available for your system.');
      return;
    }
    httpGetFile(url, bin.filename, outputDir, function (downloaded) {
      if (opt_callback) {
        opt_callback(downloaded);
      }
    });
  } else {
    console.log(bin.name + ' is up to date.');
  }
};

/**
 * Append '.exe' to a filename if the system is windows.
 */
var executableName = function (file) {
  if (os.type() == 'Windows_NT') {
    return file + '.exe';
  } else {
    return file;
  }
};

// Setup before any command.
var existingFiles = fs.readdirSync(argv.outDir),
  name;

for (name in binaries) {
  bin = binaries[name];
  var exists = fs.existsSync(path.join(argv.outDir, bin.filename));
  var outOfDateExists = false;
  existingFiles.forEach(function (file) {
    if (file.indexOf(bin.prefix) != -1 && file != bin.filename) {
      outOfDateExists = true;
    }
  });
  bin.exists = exists;
  bin.outOfDateExists = outOfDateExists;
}

switch (argv._[0]) {
  case 'start':
    if (!binaries.standalone.exists) {
      console.error('Selenium Standalone is not present. Install with ' +
        'webdriver-manager update --standalone');
      process.exit(1);
    }
    var args = ['-jar', path.join(argv.outDir, binaries.standalone.filename)];
    if (argv.seleniumPort) {
      args.push('-port', argv.seleniumPort);
    }
    if (binaries.chrome.exists) {
      args.push('-Dwebdriver.chrome.driver=' +
        path.join(argv.outDir, executableName('chromedriver')));
    }
    if (binaries.ie.exists) {
      args.push('-Dwebdriver.ie.driver=' +
        path.join(argv.outDir, executableName('iedriverServer')));
    }
    var seleniumProcess = spawnCommand('java', args);
    console.log('seleniumProcess.pid: ' + seleniumProcess.pid);
    seleniumProcess.on('exit', function (code) {
      console.log('Selenium Standalone has exited with code ' + code);
      process.exit(code);
    });
    process.stdin.resume();
    process.stdin.on('data', function () {
      console.log('Attempting to shut down selenium nicely');
      http.get('http://localhost:4444/selenium-server/driver/?cmd=shutDownSeleniumServer');
    });
    process.on('SIGINT', function () {
      console.log('Staying alive until the Selenium Standalone process exits');
    });
    break;
  case 'status':
    for (name in binaries) {
      bin = binaries[name];
      if (bin.exists) {
        console.log(bin.name + ' is up to date');
      } else if (bin.outOfDateExists) {
        console.log('**' + bin.name + ' needs to be updated');
      } else {
        console.log(bin.name + ' is not present')
      }
    }
    break;
  case 'update':
    if (argv.standalone) {
      downloadIfNew(binaries.standalone, argv.outDir, existingFiles);
    }
    if (argv.chrome) {
      downloadIfNew(binaries.chrome, argv.outDir, existingFiles,
        function (filename) {
          var zip = new AdmZip(filename);
          // Expected contents of the zip:
          //   mac/linux: chromedriver
          //   windows: chromedriver.exe
          zip.extractAllTo(argv.outDir);
          if (os.type() != 'Windows_NT') {
            fs.chmodSync(path.join(argv.outDir, 'chromedriver'), 0755);
          }
        });
    }
    if (argv.ie) {
      downloadIfNew(binaries.ie, argv.outDir, existingFiles,
        function (filename) {
          var zip = new AdmZip(filename);
          // Expected contents of the zip:
          //   iedriverServer.exe
          zip.extractAllTo(argv.outDir);
        });
    }
    break;
  default:
    console.error('Invalid command');
    optimist.showHelp();
}