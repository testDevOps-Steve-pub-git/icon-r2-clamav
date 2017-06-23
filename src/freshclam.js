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
                    if(code == 0){
                         cb(false)
                    }else{
                         cb(true)
                    }
                   
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

let config = (mode, KVPairs) => {

    if (KVPairs == undefined && mode != 'r') {
        logger.error(processType, "config freshclam failed: undefined configurations")
        return oldValues
    }
    if (Object.keys(KVPairs).length == 0 && mode != 'r') {
        logger.error(processType, "config freshclam failed: empty configuration")
        return oldValues
    }
    try {
        // process the old file
        var oldValues = {}
        let lines = undefined
        let confFile = base + freshclamConf
        let confExits = fs.existsSync(confFile)
        if (confExits) {
            // read old file content,
            lines = fs.readFileSync(confFile).toString().split('\n')
            for (var each of lines) {
                if(each.length > 0){
                    var line = each.split(' ')
                    // store old values
                    oldValues[line[0]] = line[1]
                }
            }
        }

        // determine mode of process
        var newLines = []
        let tmpFile = confFile + '.tmp'
        switch (mode) {
            // append && overwrite
            case 'ao':
                var allValues = Object.assign({}, oldValues)
                for (var key of Object.keys(KVPairs)) {
                    if(KVPairs[key] != undefined){
                        allValues[key] = KVPairs[key]
                    }
                }
                for (var key of Object.keys(allValues)) {
                    newLines.push(key + ' ' + allValues[key])
                }
                fs.appendFileSync(tmpFile, newLines.join('\n'))

                if (confExits) {
                    fs.unlinkSync(confFile)
                }
                fs.renameSync(tmpFile,confFile)

                return oldValues
            // clear && overwrite
            case 'co':
                for (var key of Object.keys(KVPairs)) {
                    if(KVPairs[key] != undefined){
                        newLines.push(key + ' ' + KVPairs[key])
                    }
                }
                fs.appendFileSync(tmpFile, newLines.join('\n'))
                // rename the proper configuration file
                if (confExits) {
                    fs.unlinkSync(confFile)
                }
                fs.renameSync(tmpFile,confFile) 

                return oldValues

            // read && untouched
            case 'ru':
                return oldValues
            default:
                return {}
        }
    } catch (e) {
        logger.error(processType, "config freshclam failed: " + e.message)
        let confFile = base + freshclamConf
         let tmpFile = confFile + '.tmp'
        if(fs.existsSync(tmpFile)){
            fs.unlinkSync(tmpFile)
        }
        return {}
    }
}

module.exports = {
    schedule: schedule,
    run: runfreshclam,
    config: config
}