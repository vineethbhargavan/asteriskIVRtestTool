var winston = require('winston');
var logLevels = {
    silly: 0,
    debug: 1,
    verbose: 2,
    info: 3,
    warn: 4,
    error: 5
};
var loglevel = "info";
var db_prefix= "IN_";
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({'timestamp': function () {
                return new Date();
            }})
    ]
});

var redis = require("redis")
        , rclient = redis.createClient();

rclient.on('connect', function () {
    logger.info(' redis client connected');

});
function setRclient(key, value, name) {
    rclient.set(db_prefix + key, JSON.stringify(value), function (err, data) {
        logger.info(name + ' set for ' + key);
    });
}

function getRclientValues(key, name, callback) {
    rclient.get(db_prefix + key, function (err, data) {
        logger.info(name + '  for ' + key);
        callback(JSON.parse(data));
    });
}
function delRclientValues(key, name) {
    //flush DB entries
    rclient.del(db_prefix + key, function (err, data) {
        logger.info(name + "data.uniqueid"+ key + ":" + data)
    });
}

function getCallerInfoFromCustkey(evt, callback) {
    getRclientValues(evt.uniqueid, 'getCallerInfoFromCustkey', function (result) {
        callback(result, evt);
    });
}

function getCallerInfoFromActionID(evt, callback) {
    getRclientValues(evt.actionid, 'getCallerInfoFromActionID', function (result) {
        callback(result, evt);
    });
}

//AMI always connected
var ami = new require('asterisk-manager')('5038', 'localhost', 'outbound', 'abc123', true);
ami.keepConnected();
var mysql = require('mysql');
var pool = mysql.createPool({
    connectionLimit: 100,
    host: '192.168.0.120',
    user: 'root',
    password: 'abc123',
    database: '1300_staging',
    debug: false
});


//var endpoint = "SIP/84483888@192.168.0.10";
var endpoint = "Local/main@deadcontext";
var tel = '0435963214#';
//var tel2 = '1999';

module.exports = {
    initiateCall: function (callparms) {
        logger.info("initiateCall" + JSON.stringify(callparms));
        ami.action({
            'action': 'originate',
            'actionid': callparms.actionid,
            'channel': endpoint,
            'context': 'staging',
            'exten': '84482818',
            'priority': 1,
            'async': 'true',
            'callerid': callparms.mobile,
            'variable': {
                'CALLERID(dnid)': callparms.dnid
            }
        }, function (err, res) {
            logger.info("Response From Originate" + JSON.stringify(res));
            if (res != null && res.uniqueid != null && res.calleridnum != null) {

                //setRclient(res.uniqueid, res.calleridnum, 'setCallerCustKeyMap');
            }
            //logger.info("Response From Originate" + res.response);

        });
    },
    testcall: function (callparms) {
        //sleep(20000);
        logger.info("Tescall" + JSON.stringify(callparms));
    }
};
ami.on('newexten', function (evt) {
    if (evt.context == "ext_1300" && evt.application == "Read" && evt.appdata.indexOf("YOURMOBNUMBER") > -1) {
        //logger.info("DTMF Insert Caller Mobile" + tel);
        logger.info("DTMF Insert OPERATOR ID channel" + evt.channel);
        //insertDTMF(tel, evt.channel);
        getCallerInfoFromCustkey(evt, function (data, evt) {
            if (data != undefined) {
                logger.info("DTMF Insert Caller mobile" + data.mobile);
                logger.info("DTMF Insert OPERATOR ID channel" + data.dtmfchannel);
                insertDTMF(data.mobile + "#", data.dtmfchannel);
            }
        });
    }
    if (evt.context == "ext_1300" && evt.application == "WaitExten" && evt.appdata == "5") {
        //logger.info("DTMF Insert ISCORRECT channel" + evt.channel);
        //insertDTMF('1', evt.channel);
        getCallerInfoFromCustkey(evt, function (data, evt) {
            if (data != undefined) {
                logger.info("DTMF Insert Option3 second channel" + data.dtmfchannel);
                insertDTMF(data.dtmfseq1, data.dtmfchannel);
            }
        });
    }


});

ami.on('localbridge', function (evt) {
    logger.info("localbridge" + JSON.stringify(evt))
    if (evt.channel1.indexOf("main@deadcontext") > -1 && evt.context == "deadcontext") {
        getCallerInfoFromCustkey(evt, function (data, evt) {
            if (data != undefined) {
                data.dtmfchannel = evt.channel2;
                data.callerchannel = evt.channel1;
                setRclient(evt.uniqueid1, data, 'localbridge_mapping');
            } else {
                var data = {};
                data.dtmfchannel = evt.channel2;
                data.callerchannel = evt.channel1;
                setRclient(evt.uniqueid1, data, 'localbridge_mapping');
            }
        });

    }
});

ami.on('originateresponse', function (evt) {
    logger.info("originateresponse" + JSON.stringify(evt))
    if (evt.channel.indexOf("main@deadcontext") > -1 && evt.context == "staging") {
        getCallerInfoFromActionID(evt, function (callparams, evt) {
            if (callparams != undefined) {
                getCallerInfoFromCustkey(evt, function (data, evt) {
                    if (data != undefined) {
                        data.mobile = callparams.mobile;
                        data.dtmfseq1 = callparams.dtmfseq1;
                        data.duration = callparams.duration;
                        data.callerduration = callparams.callerduration;
                        data.actionid = evt.actionid;
                        data.uniqueid = evt.uniqueid;
                        setRclient(evt.uniqueid, data, 'ticket Mapped');
                    } else {
                        var data = {};
                        data.mobile = callparams.mobile;
                        data.dtmfseq1 = callparams.dtmfseq1;
                        data.duration = callparams.duration;
                        data.callerduration = callparams.callerduration;
                        data.actionid = evt.actionid;
                        data.uniqueid = evt.uniqueid;
                        setRclient(evt.uniqueid, data, 'ticket Mapped');
                    }
                    handleCallerHangup(data);
                });
            }
        });
    }
});
function handleCallerHangup(callInfo) {
    setTimeout(function () {
        getCallerInfoFromCustkey(callInfo, function (data, callInfo) {
            logger.info("Caller hangup after " + data.callerduration)
            logger.info("Caller hangup after channel " + data.callerchannel)
            logger.info("Caller hangup paired? " + JSON.stringify(data))
            ami.action({
                'action': 'hangup',
                'channel': data.callerchannel
            }, function (err, res) {
                logger.info("Caller hangup after" + JSON.stringify(res))
            });

            if (data.conference != undefined) {
                data.duration = 0;
                handleOperatorHangup(data);
            } else {
                //flush DB entries
                delRclientValues(data.uniqueid,'DEL call entry Caller Hangup:');
            }
        });

    }, callInfo.callerduration);
}

function handleOperatorHangup(callInfo) {
    setTimeout(function () {
        getCallerInfoFromCustkey(callInfo, function (data, callInfo) {
            logger.info("handleOperatorHangup destinationChannel" + data.destinationChannel);
            if (data.destinationChannel != undefined) {
                logger.info("handleOperatorHangup " + JSON.stringify(data));
                ami.action({
                    'action': 'confbridgekick',
                    'channel': data.destinationChannel,
                    'conference': data.conference
                }, function (err, res) {
                    logger.info("handleOperatorHangup" + JSON.stringify(res));
                    if (res.response == "Success") {
                        logger.info("handleOperatorHangup Response" + res.response);
                        updateTicketStatus(data.ticket_id);
                        //flush DB entries
                        delRclientValues(data.uniqueid,'DEL call entry Operator Hangup:');
                    }

                });
            }
        });

    }, callInfo.duration);
}

function insertDTMF(input, channel) {
    inputLen = input.length;
    for (i = 0; i < inputLen; i++) {
        logger.info(input.charAt(i));
        ami.action({
            'action': 'PlayDTMF',
            'channel': channel,
            'digit': input.charAt(i)
        }, function (err, res) {
            logger.info("Response From PlayDTMF" + input.charAt(i) + ";" + JSON.stringify(res));
        });
    }
}



//ami.on('managerevent', function (evt) {
//    logger.info("ManagerEvet" + JSON.stringify(evt))
//});

ami.on('varset', function (evt) {
    //logger.info("VarSet" + JSON.stringify(evt))
    if ("__gticket_id" in evt.variable) {
        logger.info("VarSet ticket_id" + JSON.stringify(evt))
        getCallerInfoFromCustkey(evt, function (data, evt) {
            if (data != undefined) {
                logger.info("gticket_id" + data);
                logger.info("gticket_id value " + JSON.stringify(evt))
                data.ticket_id = evt.value;
                setRclient(evt.uniqueid, data, 'ticket Mapped');
                //insertDTMF('3', data);
            }
        });
    }
    if ("__op" in evt.variable) {
        logger.info("VarSet OP" + JSON.stringify(evt))
        getCallerInfoFromCustkey(evt, function (data, evt) {
            if (data != undefined) {
                logger.info("OP" + data);
                logger.info("OP " + JSON.stringify(evt))
                data.operator = evt.value;
                setRclient(evt.uniqueid, data, 'Operator Mapped');
                //insertDTMF('3', data);
            }
        });
    }

});

ami.on('dial', function (evt) {
    //logger.info("VarSet" + JSON.stringify(evt))
    getCallerInfoFromCustkey(evt, function (data, evt) {
        if (data != undefined && evt.destuniqueid != undefined) {
            logger.info("Dial Event " + JSON.stringify(evt))
            data.destuniqueid = evt.destuniqueid;
            data.destinationChannel = evt.destination;
            setRclient(evt.uniqueid, data, 'Destination Channel Mapped');
            //insertDTMF('3', data);
        }
    });

});
function sleep(delay) {
    var start = new Date().getTime();
    while (new Date().getTime() < start + delay)
        ;
}

ami.on('confbridgejoin', function (evt) {
    //logger.info("VarSet" + JSON.stringify(evt))
    getCallerInfoFromCustkey(evt, function (data, evt) {
        if (data != undefined) {
            logger.info("confbridgejoin Event " + JSON.stringify(evt))
            data.conference = evt.conference;

            setRclient(evt.uniqueid, data, 'Conference Mapped');
            assignTicketToOperator(data);
            handleOperatorHangup(data);

            //insertDTMF('3', data);
        }
    });

});

function updateTicketStatus(ticket_id) {
    pool.getConnection(function (err, connection) {
        if (err) {
            connection.release();
        }

        logger.info('connected as id ' + connection.threadId);
        var ticketQuery = "update tickets set status='1' where ticket_id='" + ticket_id + "'";
        connection.query(ticketQuery, function (err, rows) {
            connection.release();
            if (!err) {
                logger.info('End Of ticket closure for' + ticket_id);
            } else {
                logger.info('Error in Query');
            }
        });

        connection.on('error', function (err) {
            //resp.json({"code" : 100, "status" : "Error in connection database"});
            logger.info('Error in connection database');
            return;
        });
    });
}

function assignTicketToOperator(data) {
    pool.getConnection(function (err, connection) {
        if (err) {
            connection.release();
        }

        logger.info('connected as id ' + connection.threadId);
        var ticketQuery = "update tickets set enquiry_type='4',is_assigned='1',assigned_to='" + data.operator + "' where ticket_id='" + data.ticket_id + "'";
        connection.query(ticketQuery, function (err, rows) {
            connection.release();
            if (!err) {
                logger.info('End Of ticket closure for' + data.ticket_id);
            } else {
                logger.info('Error in Query');
            }
        });

        connection.on('error', function (err) {
            //resp.json({"code" : 100, "status" : "Error in connection database"});
            logger.info('Error in connection database');
            return;
        });
    });
}

//function kickOperator(data) {
//    logger.info("kickOperator action " + JSON.stringify(data))
//    ami.action({
//        'action': 'confbridgekick',
//        'channel': data.destinationChannel,
//        'conference': data.conference,
//    }, function (err, res) {
//        logger.info("Response From Conf Kick" + JSON.stringify(res))
//
//    });
//
//}


process.on('uncaughtException', function (err) {
    logger.info(' unhandled exception caught : ', err.message);
});

