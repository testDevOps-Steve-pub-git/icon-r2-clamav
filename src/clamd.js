let logger = require('./logger.js')
let base = '/home/vcap/app/clamav/'
let clamdExec = 'sbin/clamd'
let processType = 'Clamav daemon'
let spawn = require('child_process').spawn
let clamav = require('clamav.js')

// clamav deamon initialization
var clamdStart = (endooint, restartCounter) =>{

    if (restartCounter <= 0) {
        logger.error(processType, "Clamav daemon can not be restarted due to limited restart count")
        process.exit(1)
    }

    var clamd = spawn(base + clamdExec)
    logger.log(processType, 'Starting clamav deamon, with restart count: ' + restartCounter)

    clamd.on('error', (error) => {
        logger.error(processType, "error initializing clamav deamon, shutting down main http layer" + error)
        process.exit(1)
    })
    clamd.on('exit', (code, signal) => {
        if (code != 0) {
            logger.error(processType, "clamav daemon exited abnormally with code " + code + ", restarting clamav daemon")
            clamdStart(endpoint, restartCounter - 1)

        } else {
            logger.log(processType, "clamav daemon exited normally, shutting down main http layer")
            process.exit(1)
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
				reject("{'message': 'Cant not reach clamav deamon:" + err + "'}")
			} else {
				logger.debug(processType, "Ping clamav daemon with health state")
				resolve("{ 'message': 'Clamav daemon is alive '}")
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
				reject("{'message': 'Cant not reach clamav deamon:" + err + "'}")
			} else {
				logger.debug(processType, 'Got virus database version: ' + version)
				resolve("{'message':'clamav deamon virus database version is " + version + "'}")
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
				reject({ 'result': '' + err, "code": 400 })
			} else if (malicious) {
				logger.log(processType, 'Encounter virus: ' + malicious + ', while scanning ' + each.filename)
				resolve({ 'result': malicious + " found in file: " + each.filename, "code": 406 })
			} else {
				logger.log(processType, "No virus found while scanning: " + each.filename)
				resolve({ 'result': "No virus found in the file: " + each.filename, "code": 200 })
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