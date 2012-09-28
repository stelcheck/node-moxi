var fs     = require('fs'),
    util   = require('util'),
    moxi   = require('../index.js');

var filename    = process.argv[2];
var spinner     = '┤┘┴└├┌┬┐';
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

var client      = new moxi.moxi({'host' : 'localhost', port : 11211 });

// Hide cursor as well
process.stdout.write('File: ' + filename + ' ');
process.stdout.write(' \x1B[?25l');

process.on('exit', function () {
    process.stdout.write('\x1B[?25h');
});


// Show cursor on exit and so on
process.on('SIGINT', function () {
    process.stdout.write('\x1B[?25h');
    console.log('\bCount', util.format('%d', incr), 'Test completed in', util.format('%s', (new Date().getTime()) - ts), 'ms');
    process.exit();
});

client.set(filename, data, 0, function (err, code) {
    if (err) {
        console.error('ERROR!', err);
        process.exit(1);
    }

    ts          = new Date().getTime();

    client.get(filename, function (err, data) {
        if (err) {
            console.error('ERROR!', err);
            process.exit(1);
        }

        incr++;

        if (incr < count) {
            process.stdout.write('\b' + spinner[incr % spinner.length]);
            return client.get(filename, arguments.callee);
        }

        else {
            console.log('\bCount', incr, 'Test completed in', (new Date().getTime()) - ts, 'ms');
            process.exit(0);
        }
    });
});

