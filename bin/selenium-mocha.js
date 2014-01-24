#!/usr/bin/env node

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

var spawn = require('child_process').spawn;
var args = [__dirname + '../lib/cli.js'];

process.argv.slice(2).forEach(function(arg) {
  var flag = arg.split('=')[0];

  switch (flag) {
    case '-d':
      args.unshift('--debug');
      break;
    case 'debug':
    case '--debug':
    case '--debug-brk':
      args.unshift(arg);
      break;
    default:
      if (0 == arg.indexOf('--trace')) { args.unshift(arg); }
      else { args.push(arg); }
      break;
  }
});

var proc = spawn(process.argv[0], args, { stdio: 'inherit' });

proc.on('exit', function (code, signal) {
  process.on('exit', function() {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code);
    }
  });
});
