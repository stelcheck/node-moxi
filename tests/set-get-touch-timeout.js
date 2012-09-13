var vows = require('vows'),
    assert = require('assert'),
    moxi = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', 'port' : 11211 });

vows.describe('Store + Touch + Timeout').addBatch({
    'Set "test5" to "test5value"': {
        'topic': function () {
            client.set("test5", "test5value", 3, this.callback);
        },
        'returns "STORED"': function (data) {
            assert.equal(data, 'STORED');
        },
        'read the value of "test5"' : {
            'topic': function () {
                client.get("test5", this.callback);
            },
            'returns "test5value"': function (data) {
                assert.equal(data, 'test5value');
            },
            'touch test5' : {
                'topic': function () {
                    client.touch("test5", 6, this.callback);
                },
                'returns "TOUCHED"': function (data) {
                    assert.equal(data, 'TOUCHED');
                },
                'wait 4 seconds, read "test5" (expects empty)' : {
                    'topic': function () {
                        var that = this;
                        setTimeout(function () {
                            client.get("test5", that.callback);
                        }, 4000);
                    },
                    'returns "test5value"': function (data) {
                        assert.equal(data, 'test5value');
                    },
                    'read the value of "test5", expect empty' : {
                        'topic': function () {
                            var that = this;
                            client.del('test5', function () {
                                client.get("test5", that.callback);
                            });
                        },
                        'returns "test5value" as empty': function (data) {
                            assert.equal(data, '');
                        }
                    }
                }
            }
        }
    }
}).export(module);
