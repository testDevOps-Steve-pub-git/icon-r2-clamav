let logger = require('./logger.js')
let base = '/home/vcap/app/clamav/'
let clamdExec = 'sbin/clamd'
let processType = 'Clamav daemon'
let spawn = require('child_process').spawn;

module.exports = (endPoint,restartCounter) => {

        // restart counter
        var clamdCounter = 0
        // setup clamd
        var clamdMonitor = () => {
            if(clamdCounter >= restartCounter){
                logger.error(processType,"Clamav daemon can not be restarted due to limited restart count")
                process.exit(1)
            }

            var clamd = spawn(base + clamdExec)
        
            logger.log(processType,'Starting clamav deamon')
            clamd.on('error', (error) => {
                logger.error(processType, "error initializing clamav deamon, shutting down node js http layer" + error)
                process.exit(1)
            })
            clamd.on('exit', (code, signal) => {
                if (code != 0) {
                    logger.error(processType,"clamav daemon exited abnormally with code " + code + ", restarting clamav daemon")
                    clamdCounter += 1
                    clamdMonitor()
                 
                }else{
                    logger.log(processType,"clamav daemon exited normally")
                }


            })
            clamd.on('close', (code, signal) => {
                if (code != 0) {
                    logger.error(processType,"clamav daemon exited abnormally with code " + code + ", restarting clamav daemon")
                    clamdCounter += 1
                    clamdMonitor()
                    
                }else{
                     logger.log(processType,"clamav daemon exited normally")
                }

            })
            clamd.stderr.on('data', (err) => {
               logger.log(processType,err.toString('utf8'))
            })

            clamd.stdout.on('data', (data) => {
                logger.log(processType,data.toString('utf8'))
            })

        }

        logger.log(processType,'Start clamav monitoring, with restart count: ' + restartCounter)
        clamdMonitor()

}