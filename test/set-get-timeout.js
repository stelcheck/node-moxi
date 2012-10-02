var vows = require('vows'),
    assert = require('assert'),
    moxi = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', 'port' : 11211 });

vows.describe('Store + Timeout').addBatch({
    'Set "test2" to "test2value"': {
        'topic': function () {
            client.set('test2', 'test2value', 1, this.callback);
        },
        'returns "STORED"': function (data) {
            assert.equal(data, 'STORED');
        },
        'read the value of "test2"' : {
            'topic': function () {
                client.get('test2', this.callback);
            },
            'returns "test2value"': function (data) {
                assert.equal(data, 'test2value');
            },
            'wait 3 seconds, read "test2"' : {
                'topic': function () {
                    var that = this;
                    setTimeout(function () {
                        client.del('test2', that.callback);
                    }, 1200);
                },
                'returns "test2value"': function (data) {
                    assert.equal(data, 'NOT_FOUND');
                },
                'read the value of "test2", expect empty' : {
                    'topic': function () {
                        client.get('test2', this.callback);
                    },
                    'returns "test2value" as empty': function (data) {
                        assert.equal(data, '');
                    }
                }
            }
        }
    }
}).export(module);
