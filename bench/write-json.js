var fs     = require('fs'),
    util   = require('util'),
    moxi   = require('../index.js');

var filename    = process.argv[2];
var count       = process.argv[3] || 50000;
var ts          = 0;
var incr        = 0;

// Data from: http://json.org/example.html
var data        = {
    "glossary": {
        "title": "example glossary",
        "GlossDiv": {
            "title": "S",
            "GlossList": {
                "GlossEntry": {
                    "ID": "SGML",
                    "SortAs": "SGML",
                    "GlossTerm": "Standard Generalized Markup Language",
                    "Acronym": "SGML",
                    "Abbrev": "ISO 8879:1986",
                    "GlossDef": {
                        "para": "A meta-markup language, used to create markup languages such as DocBook.",
                        "GlossSeeAlso": ["GML", "XML"]
                    },
                    "GlossSee": "markup"
                }
            }
        }
    }
};

// We allow JSON file if necessary
if (filename) {
    try {
        var data   = JSON.parse(fs.readFileSync(filename));
    } catch (e) {
        console.error('Could not load specified data file:', e);
        process.exit(1);
    }
}

var client      = new moxi.moxi({'host' : 'localhost', port : 11211 });

process.stdout.write('File: ' + filename + ' ');

process.on('SIGINT', function () {
    console.log('Count', util.format('%d', incr), 'Test completed in', util.format('%s', (new Date().getTime()) - ts), 'ms');
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
        console.log('Count', incr, 'Test completed in', (new Date().getTime()) - ts, 'ms');
        process.exit(0);
    }
});

