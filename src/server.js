var http = require('http'),
	Busboy = require('busboy'),
	config = require("./config.js"),
	fs = require('fs'),
	guid = require('guid'),
	clamd = require('./clamd.js'),
	freshclam = require('./freshclam.js'),
	logger = require('./logger.js'),
	processType = "Server",
	cfenv = require('cfenv'),
	appEnv = cfenv.getAppEnv();
wssStart = require('./ws.js')

let responseDispatch = (msg) => {
	return JSON.stringify({ "message": msg.toString() })
}

// main http server 
var server = http.createServer((request, response) => {
	//CORS
	response.setHeader('Access-Control-Allow-Origin', '*');
	response.setHeader('Access-Control-Request-Method', '*');
	response.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET,POST');
	response.setHeader('Access-Control-Allow-Headers', '*');
	var hasFile = false
	if (request.method == 'OPTIONS') {
		response.writeHead(200)
		response.end()
	}
	else if (request.url === '/' && request.method === 'GET') {
		logger.debug(processType, "Health check of server")
		response.writeHead(200, { 'Content-Type': 'application/json' });
		response.write(responseDispatch('Server is alive'))
		response.end();
	}
	else if (request.url === '/ping' && request.method === 'GET') {
		logger.debug(processType, "Pinning request was submitted, processing .....")
		clamd.ping(config.clamd.port, config.clamd.endPoint, config.clamd.timeout).then(
			(result) => {
				response.writeHead(200, { 'Content-Type': 'application/json' });
				response.write(responseDispatch("clamav daemon is alive"))
				response.end();

			}, (reason) => {
				response.writeHead(503, { 'Content-Type': 'application/json' })
				response.write(responseDispatch(reason))
				response.end()
			}
		)
	}
	else if (request.url === '/version' && request.method === 'GET') {
		logger.debug(processType, "Version check request was submitted, processing .....")
		clamd.version(config.clamd.port, config.clamd.endPoint, config.clamd.timeout).then((version) => {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.write(responseDispatch(version))
			response.end();
		}, (reason) => {
			response.writeHead(503, { 'Content-Type': 'application/json' })
			response.write(responseDispatch(reason))
			response.end()
		})
	}
	else if (request.url === '/scan' && request.method === 'POST') {
		// handling request and respons part of HTTP
		logger.debug(processType, "Scanning request was submitted, processing .....")
		request.on('close', ()=> {
			connected = false
			logger.error(processType, "client unexpectedly drop connection")
			response.writeHead(400);
			response.end();

		});
		request.on('error', (err)=>{
			logger.error(processType,"Request getting error: " + err.message.toString())
			response.writeHead(400);
			response.end();
		})
		response.on('error',(err)=>{
			logger.error(processType,"Response error: " + err.message.toString())
		})

		// process the real message 
		var temp = fileDir + '/' + guid.raw()
		var hasFile = false
		var connected = true
		var busboy = new Busboy({ 'headers': request.headers, limits: { files: 1 } });
		busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
		
			file.pipe(fs.createWriteStream(temp))
			logger.debug(processType, "got file:" + filename + ", piping into " + temp)

			file.on('end', () => {
				hasFile = fs.existsSync(temp)
				if (connected && hasFile) {
					clamd.scan(config.clamd.port, config.clamd.endPoint, { "filename": filename, "filepath": temp }).then(result => {
						
						fs.unlinkSync(temp)

						if (result) {
							response.writeHead(406, { 'Content-Type': 'application/json' });
							response.write(responseDispatch(result))
						} else {
							response.writeHead(200, { 'Content-Type': 'application/json' });
							response.write(responseDispatch("No virus found"))
						}

						response.end()
					}, reason => {
						fs.unlinkSync(temp)
						if (reason.code == 'ECONNREFUSED') {
							response.writeHead(503, { 'Content-Type': 'application/json' });
						} else {
							response.writeHead(400, { 'Content-Type': 'application/json' });
						}
						response.write(responseDispatch(reason))
						response.end()
					})
				}else{
					if(hasFile){
						fs.unlinkSync(temp)	
					}else{
						logger.debug(processType,"Tmp file did not get created successfully. ")
					}
					if(!connected){
						logger.debug(processType,"Connection is aborted, will not process file ")
					}
				}
			})
		});

		busboy.on('finish', function () {
			if (!hasFile) {
				logger.error(processType, 'No file was submiited for scanning - bad request');
				response.writeHead(400, { 'Content-Type': 'application/json' });
				response.write(responseDispatch("no file was submitted or file has no length"))
				response.end()
			} else {
				logger.debug(processType, 'done parse file');
			}

		});

		// try to test clamav availability before scanning
		clamd.ping(config.clamd.port, config.clamd.endPoint, config.clamd.timeout).then((result) => {
			request.pipe(busboy)
		}, (reason) => {
			response.writeHead(503, { 'Content-Type': 'application/json' });
			response.write(responseDispatch(reason))
			response.end()
		})



	} else if (request.url === '/scan' && request.method === 'GET' && config.server.debug) {
		let scanFile = './src/scan.html'
		if (fs.existsSync(scanFile)) {
			fs.createReadStream(scanFile).pipe(response)

		} else {
			response.writeHead(200, { 'Content-Type': 'text/html' });
			response.end()
		}
	} else {
		response.writeHead(404);
		response.end();
		logger.error(processType, 'Invalid request: ' + request.url)
	}
});


// temp directory for files
var fileDir = '/tmp/files'
if (!fs.existsSync(fileDir)) {
	fs.mkdirSync(fileDir);
	logger.debug(processType, 'Making temp directory for uploaded files: ' + fileDir)
} else {
	logger.debug(processType, fileDir + ' already exist')
}


server.listen(appEnv.port, appEnv.bind, function () {
	logger.log(processType, 'Main Http Server is listening on ' + appEnv.bind + ':' + appEnv.port)

})



// start clamav daemon
if (!appEnv.isLocal) {
	clamd.clamdStart(config.clamd.endPoint, config.clamd.restartTime)
	logger.log(processType, 'Starting clamav deamon')
} else {
	logger.log(processType, "local environment will not enable clamav daemon")
}





// config first
if (config.freshclam.private_mirror != undefined) {
	freshclam.config('ao', { 'PrivateMirror': [config.freshclam.private_mirror] })
	logger.log(processType, 'Configuring private mirror at: ' + config.freshclam.private_mirror)
}
// start  freshclam if enabled
if (config.freshclam.auto_enabled) {
	// calculate interval
	let getDateString = (interval) => {
		var dateString = ''
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
		return dateString
	}
	let dateString = getDateString(config.freshclam.interval)
	logger.log(processType, 'Schedule virus database update every ' + dateString)
	//start
	freshclam.schedule(config.freshclam.interval)
} else {
	logger.log(processType, 'Virus database will not be updated automatically')
}



// establish  update controll server connection if enalbed. 

if (config.updateControll.enabled) {
	wssStart(config.updateControll.endpoint, config.updateControll.restartTime, config.clamd)
	logger.log(processType, 'Starting Updating controll process')

} else {
	logger.log(processType, 'Virus Update Controll is disabled')
}
