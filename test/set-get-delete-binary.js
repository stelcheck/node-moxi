var vows   = require('vows'),
    assert = require('assert'),
    fs     = require('fs'),
    moxi   = require('../index.js');

var client      = new moxi.moxi({'host' : 'localhost', port : 11211 });
var imageData   = fs.readFileSync('./data/sean.jpg');

vows.describe('Store Binary').addBatch({
    'Set "test3" to "test3value"' : {
        'topic': function () {
            client.set("test3", imageData, 3, this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.equal(data, 'STORED');
        },
        'read the value of "test3"' : {
            'topic': function () {
                client.get("test3", this.callback);
            },
            'returns "test3value"' : function (data) {
                assert.deepEqual(data, imageData);
            },
            'delete "test3"' : {
                'topic': function () {
                    client.del("test3", this.callback);
                },
                'returns "test3value"' : function (data) {
                    assert.equal(data, 'DELETED');
                },
                'read the value of "test3", expect empty' : {
                    'topic' : function () {
                        client.get("test3", this.callback);
                    },
                    'returns "test3value" as empty' : function (data) {
                        assert.equal(data, '');
                    }
                }
            }
        }
    }
}).export(module);
