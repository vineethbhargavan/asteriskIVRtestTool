var winston = require('winston');
var amiactions = require('./1300Call.js');
var logLevels = {
    silly: 0,
    debug: 1,
    verbose: 2,
    info: 3,
    warn: 4,
    error: 5
};
var loglevel = "info";
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({'timestamp': function () {
                return new Date();
            }})
    ]
});
var conf = require('../conf/incomingcall_list.json');

var redis = require("redis")
        , rclient = redis.createClient();

rclient.on('connect', function () {
    logger.info(' redis client connected');

});
function setRclient(key, value, name) {
    rclient.set("IN_" + key, JSON.stringify(value), function (err, data) {
        logger.info(name + ' set for ' + key);
    });
}

function getRclientValues(key, name, callback) {
    rclient.get("IN_" + key, function (err, data) {
        logger.info(name + '  for ' + key);
        callback(JSON.parse(data));
    });
}

function getCallerInfoFromCustkey(evt, callback) {
    getRclientValues(evt.uniqueid, 'getCallerInfoFromCustkey', function (result) {
        callback(result, evt);
    });
}

var calllist = conf.list;
logger.info("calllist " + JSON.stringify(calllist));
iterateList(1);

function iterateList(num) {
    for (i = 0; i < num; i++) {
        setTimeout(function () {
            callgroup(i);
        }, i * 150000);
    }
}

function callgroup(sequence) {
    for (i = 0; i < calllist.length; i++) {
        calllist[i].mobile=parseInt(calllist[i].mobile)+sequence;
        logger.info(calllist[i].mobile);
        setRclient(calllist[i].actionid, calllist[i], 'CallList input');
        var callinstance = calllist[i];
        logger.info(calllist[i].starttime);
        triggerCall(calllist[i]);

    }
}
function triggerCall(callinstance) {
    setTimeout(function () {
        amiactions.initiateCall(callinstance);
    }, callinstance.starttime);
}



process.on('uncaughtException', function (err) {
    logger.info(' unhandled exception caught : ', err.message);
});

