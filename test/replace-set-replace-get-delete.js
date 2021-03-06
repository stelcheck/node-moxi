var vows = require('vows'),
    assert = require('assert'),
    moxi = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', port : 11211 });

vows.describe('Store').addBatch({
    'Replace "test15" as "test15value"' : {
        'topic': function () {
            client.replace("test15", "test15value", 3, this.callback);
        },
        'returns "NOT_STORED"' : function (data) {
            assert.equal(data, 'NOT_STORED');
        },
        'Set "test15" as "test15value"' : {
            'topic': function () {
                client.set("test15", 'test15value', 3, this.callback);
            },
            'returns "STORED"' : function (data) {
                assert.equal(data, 'STORED');
            },
            'Replace "test15" again' : {
                'topic': function () {
                    client.replace("test15", "test15othervalue", 3, this.callback);
                },
                'returns "STORED"' : function (data) {
                    assert.equal(data, 'STORED');
                },
                'Get "test15" again' : {
                    'topic': function () {
                        console.log('ok');
                        client.get("test15", this.callback);
                    },
                    'returns "ok"' : function (data) {
                        console.log('ok');
                        assert.equal(data, 'test15othervalue');
                    },
                    'delete "test15"' : {
                        'topic': function () {
                            client.del("test15", this.callback);
                        },
                        'returns "DELETED"' : function (data) {
                            assert.equal(data, 'DELETED');
                        },
                        'read the value of "test15"' : {
                            'topic' : function () {
                                client.get("test15", this.callback);
                            },
                            'returns an empty string' : function (data) {
                                assert.equal(data, '');
                            }
                        }
                    }
                }
            }
        }
    }
}).export(module);
