var vows = require('vows'),
    assert = require('assert'),
    moxi = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', port : 11211 });

vows.describe('Store').addBatch({
    'Set "test12" to "test12value"' : {
        'topic': function () {
            client.set("test12", "test12value", 3, this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.equal(data, 'STORED');
        },
        'append to the value of "test12"' : {
            'topic': function () {
                var that = this;
                client.append("test12", 'appended', 3, function (ret) {
                    client.get('test12', that.callback);
                });
            },
            'returns "test12value"' : function (data) {
                assert.equal(data, 'test12valueappended');
            },
            'prepend to the value of "test12"' : {
                'topic': function () {
                    var that = this;
                    client.prepend("test12", 'prepended', 3, function (ret) {
                        client.get('test12', that.callback);
                    });
                },
                'returns "test12value"' : function (data) {
                    assert.equal(data, 'prependedtest12valueappended');
                },
                'delete "test12"' : {
                    'topic': function () {
                        client.del("test12", this.callback);
                    },
                    'returns "test12value"' : function (data) {
                        assert.equal(data, 'DELETED');
                    },
                    'read the value of "test12", expect empty' : {
                        'topic' : function () {
                            client.get("test12", this.callback);
                        },
                        'returns "test12value" as empty' : function (data) {
                            assert.equal(data, '');
                        }
                    }
                }
            }
        }
    }
}).export(module);
