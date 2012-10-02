var vows = require('vows'),
    assert = require('assert'),
    moxi = require('../index.js');

vows.describe('Connection').addBatch({
    'For an existing server, ': {
        topic: function () {
            return new moxi.moxi({'host' : 'localhost', port: 11211});
        },

        'we get a null error on set': function (topic) {
            topic.set("test1", "value", 1, function (err) {
                assert.equal(err, null);
            });
        }
    },
    'For a non-existing server': {
        topic: function () {
            return new moxi.moxi({'host' : 'localhost', port: 22122});
        },
        'we get "ECONNREFUSED" err.errno on set': function (topic) {
            topic.set("test2", "value", 1, function (err) {
                assert.equal(err.errno, 'ECONNREFUSED');
            });
        }
    }
}).export(module);
