var cfenv = require('cfenv'),
    appEnv = cfenv.getAppEnv(),
    WebSocket = require('ws'),
    logger = require('./logger.js'),
    processType = 'Virus Update Controll',
    freshclam = require('./freshclam.js'),
    clamd = require('./clamd.js'),
    identifier = {
        application_id: appEnv.app.application_id, application_name: appEnv.app.application_name,
        application_uris: appEnv.app.application_uris, instance_index: appEnv.app.instance_index,
        instance_id: appEnv.app.instance_id
    }




module.exports = wssStart = (endpoint, restartTime, clamdConfig) => {

    if (endpoint == undefined) {
        return logger.log(processType, "Virus update endpoint is not specified, connection to Virus Update will not be established. ")
    }
    var wss = undefined
    try {
        wss = new WebSocket(endpoint, {
            headers: {
                Authorization: 'Basic YWRtaW46YWRtaW4='
            }
        })
    }

    catch (e) {
        logger.error(processType, "Connection to updated server failed: " + e.message)
        logger.log(processType, "Connection to Virus Update will be re-established in " + restartTime + " seconds ")
        setTimeout(() => {
            wssStart(endpoint, restartTime, clamdConfig)
        }, restartTime * 1000)
    }
    if (wss == undefined) {
        return
    }
    var msgMap = { "init": "init", "reset": "reset", "heartbeat": "heartbeat", "version": "version", "update": 'update' }
    wss.onopen = (event) => {
        logger.log(processType, "Connection to Virus Update Controll server is open")
        // send initialization detail
        wss.send(JSON.stringify({ "type": msgMap['init'], "identifier": identifier, "detail": '' }))
    }
    wss.onerror = (err) => {

        logger.error(processType, "Connection to updated server failed: " + err)
    }
    wss.onclose = (event) => {
        logger.log(processType, "Connection to Virus Update Controll is closed. It will be re-established in " + restartTime + " seconds ")
        setTimeout(() => {
            wssStart(endpoint, restartTime, clamdConfig)
        }, restartTime * 1000)
    }
    /* message process from the websocket*/
    wss.on('message', (msg) => {
        let data = JSON.parse(msg)
        switch (data.type) {
            case msgMap['init']:
                logger.log(processType, 'registered with update controll server at: ' + endpoint)
                break;
            case msgMap['reset']:
                logger.log(processType, 'connection re-established with update controll server at: ' + endpoint)
                break
            case msgMap['heartbeat']:
                logger.debug(processType, "On heartbeat request")
                clamd.ping(clamdConfig.port, clamdConfig.endPoint, clamdConfig.timeout).then((result) => {
                    if (wss.readyState === WebSocket.OPEN) {
                        wss.send(JSON.stringify({ "type": msgMap['heartbeat'], "identifier": identifier, "detail": 'green' }))
                    } else {
                        logger.log(processType, "Can not send heartbeat, communication tunnel is closed, please wait for re-establishing connection .")
                    }

                }, (reason) => {
                    if (wss.readyState === WebSocket.OPEN) {
                        wss.send(JSON.stringify({ "type": msgMap['heartbeat'], "identifier": identifier, "detail": 'red' }))
                    } else {
                        logger.log(processType, "Can not send heartbeat, communication tunnel is closed, please wait for re-establishing connection .")
                    }
                }
                )

                break;

            case msgMap['version']:
                logger.debug(processType, "On version checking request")
                clamd.version(clamdConfig.port, clamdConfig.endPoint, clamdConfig.timeout).then((version) => {
                    if (wss.readyState === WebSocket.OPEN) {
                        wss.send(JSON.stringify({ "type": msgMap['version'], "identifier": identifier, "detail": {"version":version} }))
                    } else {
                        logger.log(processType, "Can not send version, communication tunnel is closed, please wait for connection reset.")
                    }
                }, (err) => {
                    if (wss.readyState === WebSocket.OPEN) {
                        wss.send(JSON.stringify({ "type": msgMap['version'], "identifier": identifier, "detail":{"errorMsg":err.toString()} }))
                    } else {
                        logger.log(processType, "Can not send version, communication tunnel is closed, please wait for connection reset.")
                    }
                })
                break;
            case msgMap['update']:
                let PrivateMirror = data.detail.options.PrivateMirror
                let oldValues = undefined
                if (PrivateMirror != undefined) {
                    oldValues = freshclam.config('ao', { "PrivateMirror": [PrivateMirror] })
                }
                logger.debug(processType, "On virus database update request")
                if (wss.readyState === WebSocket.OPEN) {
                    wss.send(JSON.stringify({ "type": msgMap['update'], "identifier": identifier, "detail": { "updating": true, "updatingError": false, "errorMsg": undefined } }))
                } else {
                    logger.log(processType, "Can not send heartbeat, communication tunnel is closed, please wait for connection reset.")
                }
                freshclam.run(
                    (error) => {
                        if (error) {
                            logger.debug(processType, "Failed to updated virus database")
                            if (wss.readyState === WebSocket.OPEN) {
                                wss.send(JSON.stringify({ "type": msgMap['update'], "identifier": identifier, "detail": { "updating": false, "updatingError": true, "errorMsg": error } }))
                            }
                        } else {
                            if (wss.readyState === WebSocket.OPEN) {
                                logger.debug(processType, "Successfully updated virus database")
                                wss.send(JSON.stringify({ "type": msgMap['update'], "identifier": identifier, "detail": { "updating": false, "updatingError": false, "errorMsg": undefined } }))
                            }
                        }
                        if (oldValues != undefined) {
                            freshclam.config('co', oldValues)
                        }
                    }
                )


                break;
            default: break;
        }

    })

}