var fs     = require('fs'),
    util   = require('util'),
    moxi   = require('memcached');

var filename    = process.argv[2];
var count       = process.argv[3] || 10000;
var ts          = 0;
var incr        = 0;

if (!filename) {
    console.error('Please specify a data file to load');
    process.exit(1);
}

try {
    var data   = fs.readFileSync(filename).toString();
} catch (e) {
    console.error('Could not load specified data file:', e);
    process.exit(1);
}

var client      = new moxi(['localhost:11211']);

process.stdout.write('File: ' + filename + ' ');

process.on('SIGINT', function () {
    console.log('\bCount', util.format('%d', incr), 'Test completed in', util.format('%s', (new Date().getTime()) - ts), 'ms');
    process.exit();
});

ts          = new Date().getTime();

client.set(filename, data, 0, function (err, data) {
    if (err) {
        console.error('ERROR!', err);
        process.exit(1);
    }

    incr++;

    if (incr < count) {
        return client.set(filename, data, 0, arguments.callee);
    }

    else {
        console.log('\bCount', incr, 'Test completed in', (new Date().getTime()) - ts, 'ms');
        process.exit(0);
    }
});

