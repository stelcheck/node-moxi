var vows   = require('vows'),
    assert = require('assert'),
    fs     = require('fs'),
    moxi   = require('../index.js');

var client      = new moxi.moxi({'host' : 'localhost', port : 11211, log: {verbose:true}  });
var imageData   = fs.readFileSync('./data/512k.txt').toString();

vows.describe('Store Large Text Data (512k data block)').addBatch({
    'Set "test7" to "test7value"' : {
        'topic': function () {
            client.set("test7", 3, imageData, this.callback);
        },
        'returns "STORED"' : function (data) {
            assert.equal(data, 'STORED');
        },
        'read the value of "test7"' : {
            'topic': function () {
                client.get("test7", this.callback);
            },
            'returns "test7value"' : function (data) {
                assert.equal(data, imageData);
            },
            'delete "test7"' : {
                'topic': function () {
                    client.del("test7", this.callback);
                },
                'returns "test7value"' : function (data) {
                    assert.equal(data, 'DELETED');
                },
                'read the value of "test7", expect empty' : {
                    'topic' : function () {
                        client.get("test7", this.callback);
                    },
                    'returns "test7value" as empty' : function (data) {
                        assert.equal(data, '');
                    }
                }
            }
        }
    }
}).export(module);
