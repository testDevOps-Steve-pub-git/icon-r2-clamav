let logger = require('./logger.js')
let processType = 'Virus Database Update'
let base = '/home/vcap/app/clamav/'
let freshclamExec = 'bin/freshclam'
let freshclamConf = 'etc/freshclam.conf'
let spawn = require('child_process').spawn
let fs = require('fs')
var isRunning = false

let runfreshclam = (cb, command) => {
    if (!isRunning) {
        logger.log(processType, 'Start update virus database')
        let freshclam = spawn(base + freshclamExec, ['--daemon-notify=' + base + 'etc/clamd.conf'])
        var error = false
        isRunning = true

        freshclam.on('error', (err) => {
            isRunning = false
            error = true
            if (cb != undefined) {
                cb(true)
            }
            logger.error(processType, "error creating freshclam, unable to get new virus definitions: " + err.message)
        })

        freshclam.on('exit', (code, signal) => {
            if (code == 0) {
                logger.log(processType, 'Virus database updated successfully')
            } else {
                logger.error(processType, 'Virus database updated unsuccessfully, exit code: ' + code)
            }
            if (!error) {
                isRunning = false
                if (cb != undefined) {
                    cb(false)
                }
            }

        })


        freshclam.stderr.on('data', (err) => {
            logger.error(processType, err.toString('utf8'))
        })

        freshclam.stdout.on('data', (data) => {
            logger.log(processType, data.toString('utf8'))
        })

    } else {
        logger.error(processType, "Virus database process is already running")
        if (cb != undefined) {
            cb(false)
        }
    }

}



let schedule = (interval) => {
    // schedule freshclam
    setInterval(runfreshclam, interval)
}

let config = (key, value) => {
    if (value != undefined && key != undefined) {
        let lines = undefined
        if (fs.existsSync(base + freshclamConf)) {
            // read file content, and delete old file
            lines = fs.readFileSync(base + freshclamConf).toString().split('\n')
            fs.unlink(base + freshclamConf)
            // create new config
            fs.appendFileSync(base + freshclamConf, '')
            try {
                let newLines = []
                for(var each of lines){
                     var line = each.split(' ')
                    if (line[0] == key) {
                        line[1] = value
                    }
                    newLines.push(line.join(' '))
                }
                fs.appendFileSync(base + freshclamConf, newLines.join('\n'))
            } catch (e) {
                logger.error(processType, "config freshclam failed: " + e.message)
            }
        } else {
            fs.appendFileSync(base + freshclamConf, key + ' ' + value)
        }




    }else{
            logger.error(processType, "config freshclam failed: empty configuration")
    }   
}

module.exports = {
    schedule: schedule,
    run: runfreshclam,
    config: config
}