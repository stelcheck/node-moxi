var vows = require('vows'),
    assert = require('assert'),
    moxi = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', port: 11211});

vows.describe('Read empty').addBatch({
    'read the value of "test"' : {
        'topic': function () {
            client.get("test", this.callback);
        },
        'returns "test1value"': function (data) {
            assert.equal(data, '');
        }
    }
}).export(module);
