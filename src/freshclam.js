let logger = require('./logger.js')
let processType = 'Virus Database Update'
let base =  __dirname.replace('/src','') + '/clamav/'
let freshclamExec = 'bin/freshclam'
let freshclamConf = 'etc/freshclam.conf'
let spawn = require('child_process').spawn
let fs = require('fs')
var isRunning = false
var freshclamTimer = undefined
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
                cb("error updating: " + err.message)
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
                    if (code == 0) {
                        cb()
                    } else {
                        cb("Virus database updated unsuccessfully, exit code: " + code)
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
            cb("Virus database process is already running")
        }
    }

}



let schedule = (interval) => {
    // schedule freshclam
    freshclamTimer = setInterval(runfreshclam, interval)
}

let config = (mode, KVPairs) => {
    let multipleKeys = ['DatabaseCustomURL','DatabaseMirror','PrivateMirror','ExtraDatabase']
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
        // multiple value for these values
        for (var key of multipleKeys){
             oldValues[key] = []
        }
        let lines = undefined
        let confFile = base + freshclamConf
        let confExits = fs.existsSync(confFile)
        if (confExits) {
            // read old file content,
            lines = fs.readFileSync(confFile).toString().split('\n')
            for (var each of lines) {
                if (each.length > 0) {
                    var line = each.split(' ')
                    // store old values
                    if (multipleKeys.indexOf(line[0]) > 0) {
                        oldValues[line[0]].push(line[1])
                    } else {
                        oldValues[line[0]] = line[1]
                    }

                }
            }
        }

        // determine mode of process
        var newLines = []
        let tmpFile = confFile + '.tmp'
        switch (mode) {
            // append && overwrite
            case 'ao':
                var allValues = JSON.parse(JSON.stringify(oldValues))
                for (var key of Object.keys(KVPairs)) {
                    if (KVPairs[key] != undefined) {
                        allValues[key] = KVPairs[key]
                    }
                }
                for (var key of Object.keys(allValues)) {
                    if (multipleKeys.indexOf(key) >= 0) {
                        for (var each of allValues[key]) {
                            newLines.push(key + ' ' + each)
                        }
                    } else {
                        newLines.push(key + ' ' + allValues[key])
                    }

                }
                fs.appendFileSync(tmpFile, newLines.join('\n'))

                if (confExits) {
                    fs.unlinkSync(confFile)
                }
                fs.renameSync(tmpFile, confFile)

                return oldValues
            // clear && overwrite
            case 'co':
                for (var key of Object.keys(KVPairs)) {
                    if (KVPairs[key] != undefined) {
                        if (multipleKeys.indexOf(key) >= 0) {
                            for (var each of KVPairs[key]) {
                                newLines.push(key + ' ' + each)
                            }
                        } else {
                            newLines.push(key + ' ' + KVPairs[key])
                        }
                    }
                }
                fs.appendFileSync(tmpFile, newLines.join('\n'))
                // rename the proper configuration file
                if (confExits) {
                    fs.unlinkSync(confFile)
                }
                fs.renameSync(tmpFile, confFile)

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
        if (fs.existsSync(tmpFile)) {
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


let exitHandler = (e)=>{
    if(freshclamTimer != undefined){
         clearInterval(freshclamTimer)
    }
 
  logger.log(processType, "Freshclam scheduling process exit.") 
  if(e){
    logger.error(processType,e)
  }
}
process.on('SIGINT',exitHandler)

process.on('exit',exitHandler)

process.on('uncaughtException',exitHandler)