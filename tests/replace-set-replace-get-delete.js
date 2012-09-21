var vows = require('vows'),
    assert = require('assert'),
    moxi = require('../index.js');

var client = new moxi.moxi({'host' : 'localhost', port : 11211 });

vows.describe('Store').addBatch({
    'Replace "test15" as "test15value"' : {
        'topic': function () {
            client.replace("test15", 3, "test15value", this.callback);
        },
        'returns "NOT_STORED"' : function (data) {
            assert.equal(data, 'NOT_STORED');
        },
        'Set "test15" as "test15value"' : {
            'topic': function () {
                client.set("test15", 3, 'test15value', this.callback);
            },
            'returns "STORED"' : function (data) {
                assert.equal(data, 'STORED');
            },
            'Replace "test15" again' : {
                'topic': function () {
                    client.replace("test15", 3, "test15othervalue", this.callback);
                },
                'returns "STORED"' : function (data) {
                    assert.equal(data, 'STORED');
                },
                'Get "test15" again' : {
                    'topic': function () {
                        client.get("test15", this.callback);
                    },
                    'returns "STORED"' : function (data) {
                        assert.equal(data, 'test15othervalue');
                    },
                    'delete "test15"' : {
                        'topic': function () {
                            client.del("test15", this.callback);
                        },
                        'returns "test15value"' : function (data) {
                            assert.equal(data, 'DELETED');
                        },
                        'read the value of "test15", expect empty' : {
                            'topic' : function () {
                                client.get("test15", this.callback);
                            },
                            'returns "test15value" as empty' : function (data) {
                                assert.equal(data, '');
                            }
                        }
                    }
                }
            }
        }
    }
}).export(module);
