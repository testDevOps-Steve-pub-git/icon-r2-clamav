var	 cfenv = require('cfenv'),
	appEnv = cfenv.getAppEnv(),
    WebSocket = require('ws'),
 	 logger = require('./logger.js'),
     processType = 'Virus Update Controll',
	 freshclam = require('./freshclam.js'),
     error = false,
     clamd = require('./clamd.js'),
     config = require('./config.js'),
     identifier = { application_id:appEnv.application_id,application_name:appEnv.application_name,
                    application_urls:appEnv.application_urls,instance_index:appEnv.instance_index,
                    instance_id:appEnv.instance_id}




module.exports = wssStart= (enabled,endpoint) => {
	if(!enabled){
		logger.log(processType,'Virus Update Controll is disabled')
		return 
	}else{
		if(endpoint == undefined){
			logger.error(processType,"Virus Update Controll server endpoint is missing, connection will not be established.")
		return 
		}
	}

	let wss  = new WebSocket(endpoint)
    var msgMap = ['init','status','action']
    let timer = 0
	wss.onopen = (event) => {  
        logger.log(processType,"Connection to Virus Update Controll server is open, will be reset every 2 minutes")
        // send regisitration detail
        wss.send(JSON.stringify({"type":msgMap[0],"identifier":identifier,"detail":''}))
		
        // send status update of clam deadmon every minute
        timer = setInterval(()=>{
            clamd.ping(config.clamd.port,config.clamd.endPoint,config.clamd.timeout).then((result)=>{
                wss.send(JSON.stringify({"type":msgMap[1],"identifier":identifier,"detail":'green'}))
            },(reason)=>{
                wss.send(JSON.stringify({"type":msgMap[1],"identifier":identifier,"detail":'red'}))
            }
            )
        },60000)
	}
	wss.onerror = (err) => {
		logger.error(processType,"Connection to updated server failed: " + err) 
        error = true
	}
	wss.onclose = (event) => {
        // delete timer, release resource
        clearInterval(timer)
       if(!error && !event.wasClean){
        logger.debug(processType, "Connection to Virus Update Controll server will be reset")
		wssStart(enabled,endpoint)
       }else{
           logger.log(processType,"Connection to virus Update Controll closed normally, virus database will not be updated anymore.")
       }
     
	}
    wss.on('message', (data) => {
		if(data == "update freshclam"){
			freshclam.run()
		}else if(data == "get status"){
             clamd.ping(config.clamd.port,config.clamd.endPoint,config.clamd.timeout).then((result)=>{
                wss.send(JSON.stringify({"type":msgMap[1],"identifier":identifier,"detail":'green'}))
            },(reason)=>{
                wss.send(JSON.stringify({"type":msgMap[1],"identifier":identifier,"detail":'red'}))
            }
            )
        }
	})

}