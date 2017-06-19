var cfenv = require('cfenv'),
    appEnv = cfenv.getAppEnv(),
    WebSocket = require('ws'),
    logger = require('./logger.js'),
    processType = 'Virus Update Controll',
    freshclam = require('./freshclam.js'),
    error = false,
    clamd = require('./clamd.js'),
    config = require('./config.js'),
    identifier = {
        application_id: appEnv.app.application_id, application_name: appEnv.app.application_name,
        application_urls: appEnv.app.application_urls, instance_index: appEnv.app.instance_index,
        instance_id: appEnv.app.instance_id
    }




module.exports = wssStart = (enabled, endpoint, reset) => {
    if (!enabled) {
        logger.log(processType, 'Virus Update Controll is disabled')
        return
    } else {
        if (endpoint == undefined) {
            logger.error(processType, "Virus Update Controll server endpoint is missing, connection will not be established.")
            return
        }
    }

    let wss = new WebSocket(endpoint)
    var msgMap = { "init": "init", "reset": "reset", "heartbeat": "heartbeat", "update":'update' }
    let timer = 0
    wss.onopen = (event) => {
        let type = msgMap['init']
        if (reset) {
            type = msgMap['reset']
        }
        logger.log(processType, "Connection to Virus Update Controll server is open, will be reset every 2 minutes")
        // send initialization detail
        wss.send(JSON.stringify({ "type": type, "identifier": identifier, "detail": '' }))

        // send status update of clam deadmon every minute
        timer = setInterval(() => {
            logger.debug(processType, "Sending heartbeat to updated controll server")
            clamd.ping(config.clamd.port, config.clamd.endPoint, config.clamd.timeout).then((result) => {
                if (wss.readyState === WebSocket.OPEN) {
                    wss.send(JSON.stringify({ "type": msgMap['heartbeat'], "identifier": identifier, "detail": 'green' }))
                } else {
                    logger.log(processType, "Communication tunnel accidentally closed, please wait for connection reset.")
                }

            }, (reason) => {
                if (wss.readyState === WebSocket.OPEN) {
                    wss.send(JSON.stringify({ "type": msgMap['heartbeat'], "identifier": identifier, "detail": 'red' }))
                } else {
                    logger.log(processType, "Communication tunnel accidentally closed, please wait for connection reset.")
                }

            }
            )

        }, 60000)
    }
    wss.onerror = (err) => {
        clearInterval(timer)
        logger.error(processType, "Connection to updated server failed: " + err)
        error = true
    }
    wss.onclose = (event) => {
        // delete timer, release resource
        clearInterval(timer)
        if (!error && !event.wasClean) {
            logger.debug(processType, "Connection to Virus Update Controll server will be reset")
            wssStart(enabled, endpoint, true)
        } else {
            logger.log(processType, "Connection to virus Update Controll closed normally, virus database will not be updated anymore.")
        }

    }
    /* message process from the websocket*/
    wss.on('message', (msg) => {
        let data = JSON.parse(msg)
        switch (data.type) {
            case msgMap['init']:
                logger.log(processType, 'registered with update controll server at: ' + endpoint)
                break;
            case msgMap['reset']:
                logger.log(processType, 'connection reset with update controll server at: ' + endpoint)
                break
            case msgMap['heartbeat']:
                logger.debug(processType, "Manually deliver heartbeat to update controll server")
                clamd.ping(config.clamd.port, config.clamd.endPoint, config.clamd.timeout).then((result) => {
                    if (wss.readyState === WebSocket.OPEN) {
                        wss.send(JSON.stringify({ "type": msgMap['heartbeat'], "identifier": identifier, "detail": 'green' }))
                    } else {
                        logger.log(processType, "Communication tunnel accidentally closed, please wait for connection reset.")
                    }

                }, (reason) => {
                    if (wss.readyState === WebSocket.OPEN) {
                        wss.send(JSON.stringify({ "type": msgMap['heartbeat'], "identifier": identifier, "detail": 'red' }))
                    } else {
                        logger.log(processType, "Communication tunnel accidentally closed, please wait for connection reset.")
                    }
                }
                )

                break;
            case msgMap['update']:
                logger.debug(processType, "received virus database update signal from updated controll server")
                if (wss.readyState === WebSocket.OPEN) {
                    wss.send(JSON.stringify({ "type": msgMap['update'], "identifier": identifier, "detail":{"updating":true,"updatingError":false} }))
                } else {
                    logger.log(processType, "Communication tunnel accidentally closed, please wait for connection reset.")
                }
                freshclam.run(
                    (error) => {
                        if (error) {
                            logger.debug(processType, "Failed to updated virus database")
                            wss.send(JSON.stringify({ "type": msgMap['update'], "identifier": identifier, "detail": {"updating":false,"updatingError":true} }))
                        } else {
                            logger.debug(processType, "Successfully updated virus database")
                            wss.send(JSON.stringify({ "type": msgMap['update'], "identifier": identifier, "detail": {"updating":false,"updatingError":false} }))
                        }

                    }

                )

                break;
            default: break;
        }

    })

}