let logger = require('./logger.js')
let base =  __dirname.replace('/src','') + '/clamav/'
let clamdExec = 'sbin/clamd'
let processType = 'Clamav daemon'
let spawn = require('child_process').spawn
let clamav = require('clamav.js')

// clamav deamon initialization
var clamdStart = (endpoint,restartTime,restart) =>{
	var error = false
    var clamd = spawn(base + clamdExec)
	if(restart!=undefined){
		logger.log(processType, 'Restarting clamav deamon')
	}

    clamd.on('error', (error) => {
        logger.error(processType, "error initializing clamav deamon: " + error + ' - retry in ' + restartTime + ' seconds')
		error = true
		setInterval(()=>{
				clamdStart(endpoint,restartTime,true)
		},restartTime * 1000) 
    })
    clamd.on('exit', (code, signal) => {
        logger.error(processType, "clamav daemon exited  with code " + code)
		logger.log(processType,"Restarting clamav daemon in " + restartTime + " seconds")
        if(!error){
			setInterval(()=>{
				clamdStart(endpoint,restartTime,true)
			},restartTime * 1000) 
		}
		

    })
    clamd.stderr.on('data', (err) => {
        logger.log(processType, err.toString('utf8'))
    })

    clamd.stdout.on('data', (data) => {
        logger.log(processType, data.toString('utf8'))
    })

}


// clamav daemon ping function
var ping = (port,endpoint,timeout) => {
	logger.debug(processType, "Pinning clamav daemon")
	return new Promise((resolve, reject) => {
		clamav.ping(port,endpoint,timeout, (err) => {
			if (err) {
				logger.error(processType, "Cant not reach clamav deamon: " + err)
				reject(err)
			} else {
				logger.debug(processType, "Ping clamav daemon with health state")
				resolve()
			}
		})
	})

}
// clamav version function 
var version = (port,endpoint,timeout) => {
	logger.debug(processType, 'Checking version of clamav daemon')
	return new Promise((resolve, reject) => {
		clamav.version(port, endpoint, timeout, (err, version) => {
			if (err) {
				logger.error(processType, "Cant not reach clamav deamon: " + err)
				reject(err)
			} else {
				logger.debug(processType, 'Got virus database version: ' + version)
				resolve(version)
			}
		}
		)
	})
}

// clamav scanning function 
var scan = (port,endpoint,each) => {
	logger.log(processType, "scanning file: " + each.filename)
	return new Promise((resolve, reject) => {

		clamav.createScanner(port, endpoint).scan(each.filepath, (err, object, malicious) => {

			if (err) {
				logger.error(processType, 'Encounter error while scanning ' + each.filename + ', ' + err)
				reject(err)
			} else if (malicious) {
				logger.log(processType, 'Encounter virus: ' + malicious + ', while scanning ' + each.filename)
				resolve(malicious)
			} else {
				logger.log(processType, "No virus found while scanning: " + each.filename)
				resolve()
			}

		})
	})


}


module.exports = {
    clamdStart:clamdStart,
    ping:ping,
    version:version,
    scan:scan
 
}