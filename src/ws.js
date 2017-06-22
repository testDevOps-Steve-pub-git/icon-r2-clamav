var cfenv = require('cfenv'),
    appEnv = cfenv.getAppEnv(),
    WebSocket = require('ws'),
    logger = require('./logger.js'),
    processType = 'Virus Update Controll',
    freshclam = require('./freshclam.js'),
    clamd = require('./clamd.js'),
    identifier = {
        application_id: appEnv.app.application_id, application_name: appEnv.app.application_name,
        application_urls: appEnv.app.application_urls, instance_index: appEnv.app.instance_index,
        instance_id: appEnv.app.instance_id
    }




module.exports = wssStart = (endpoint,restartTime,clamdConfig) => {


    var wss = undefined
    try {
        wss = new WebSocket(endpoint,{
            headers:{
                Authorization: 'Basic YWRtaW46YWRtaW4='
            }
        })
    }

    catch (e) {
        logger.error(processType, "Connection to updated server failed: " + e.message)
        logger.log(processType, "Connection to Virus Update will be re-established in " + restartTime + " seconds ")  
        setTimeout(() => {
            wssStart(endpoint,restartTime,clamdConfig)
        }, restartTime * 1000)
    }
    if (wss == undefined) {
        return
    }
    var msgMap = { "init": "init", "reset": "reset", "heartbeat": "heartbeat", "update": 'update' }
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
            wssStart(endpoint,restartTime,clamdConfig)
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
            case msgMap['update']:
                logger.debug(processType, "On virus database update request")
                if (wss.readyState === WebSocket.OPEN) {
                    wss.send(JSON.stringify({ "type": msgMap['update'], "identifier": identifier, "detail": { "updating": true, "updatingError": false } }))
                } else {
                    logger.log(processType, "Can not send heartbeat, communication tunnel is closed, please wait for connection reset.")
                }
                freshclam.run(
                    (error) => {
                        if (error) {
                            logger.debug(processType, "Failed to updated virus database")
                            if (wss.readyState === WebSocket.OPEN) {
                                wss.send(JSON.stringify({ "type": msgMap['update'], "identifier": identifier, "detail": { "updating": false, "updatingError": true } }))
                            }
                        } else {
                            if (wss.readyState === WebSocket.OPEN) {
                                logger.debug(processType, "Successfully updated virus database")
                                wss.send(JSON.stringify({ "type": msgMap['update'], "identifier": identifier, "detail": { "updating": false, "updatingError": false } }))
                            }
                        }

                    }

                )

                break;
            default: break;
        }

    })

}