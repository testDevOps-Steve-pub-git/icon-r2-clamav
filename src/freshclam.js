let logger = require('./logger.js')
let processType = 'Virus Database Update'
let base = '/home/vcap/app/clamav/'
let freshclamExec = 'bin/freshclam'
let spawn = require('child_process').spawn
var isRunning = false

let runfreshclam = (cb) => {
    if (!isRunning) {
        logger.log(processType, 'Start update virus database')
        let freshclam = spawn(base + freshclamExec, ['--daemon-notify=' + base + 'etc/clamd.conf'])
        isRunning = true

        freshclam.on('error', (error) => {
             if(cb != undefined){
                cb(true)
             }
            logger.error(processType, "error creating freshclam, unable to get new virus definitions" + error)
            isRunning = false
          
        })

        freshclam.on('exit', (code, signal) => {
            if (code == 0) {
                if(cb != undefined){
                cb(false)
                }
               
                logger.log(processType, 'Virus database updated successfully')
            } else {
                if(cb != undefined){
                cb(true)
                }
                logger.error(processType, 'Virus database updated unsuccessfully, exit code: ' + code)
            }
            isRunning = false
            
        })


        freshclam.stderr.on('data', (err) => {
            logger.error(processType, err.toString('utf8'))
        })

        freshclam.stdout.on('data', (data) => {
            logger.log(processType, data.toString('utf8'))
        })

    } else {
        logger.error(processType, "Virus database process is already running")
          if(cb != undefined){
                cb(false)
            }
    }

}

module.exports = {
    schedule: (enabled, interval) => {
        if (!enabled) {
            logger.log(processType, 'Virus database will not be updated automatically, please use virus update controll.')
        } else {
            var dateString = ''
            // schedule freshclam
            let secs = Math.floor((interval / 1000) % 60)
            let mins = Math.floor((interval / (1000 * 60)) % 60)
            let hours = Math.floor((interval / (1000 * 60 * 60)) % 24)
            let days = Math.floor((interval / (1000 * 60 * 60 * 24)))
            if (days) {
                dateString += days + ' days, '
            }
            if (hours) {
                dateString += hours + ' hours, '
            }
            if (mins) {
                dateString += mins + ' minutes, '
            }
            if (secs) {
                dateString += secs + ' seconds.'
            }
            logger.log(processType, 'Schedule virus database update every ' + dateString)
            setInterval(runfreshclam, interval)
        }
    },
    "run": runfreshclam
}