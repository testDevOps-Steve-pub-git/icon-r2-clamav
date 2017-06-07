let logger = require('./logger.js')
let processType = 'Virus Database Update'
let base = '/home/vcap/app/clamav/'
let freshclamExec = 'bin/freshclam'
let spawn = require('child_process').spawn
var isRunning = false

let runfreshclam = () => {
    if (!isRunning) {
        logger.log(processType, 'Start update virus database')
        let freshclam = spawn(base + freshclamExec, ['--daemon-notify=' + base + 'etc/clamd.conf'])
        isRunning = true

        freshclam.on('error', (error) => {
            logger.error(processType, "error creating freshclam, unable to get new virus definitions" + error)

        })

        freshclam.on('exit', (code, signal) => {
            if (code == 0) {
                logger.log(processType, 'Virus database updated successfully')
            } else {
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

    }else{
        logger.error(processType,"Virus database process is already running")
    }

}

module.exports = {

    0: (interval) => {
        // set up freshclam
        let secs = Math.floor((interval / 1000) % 60)
        let mins = Math.floor((interval / (1000 * 60)) % 60)
        let hours = Math.floor((interval / (1000 * 60 * 60)) % 24)
        let days = Math.floor((interval / (1000 * 60 * 60 * 24)))
        logger.log(processType, 'Schedule freshclam to update virus database every ' + days + ' days ' + hours + ' hours ' + mins + ' minutes ' + secs + ' seconds')
        setInterval(runfreshclam, interval)
    },
    1: (interval) => {
        logger.log(processType, 'Virus database will not updated automatically')
    },
    "run": runfreshclam
}