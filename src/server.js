var http = require('http'),
	Busboy = require('busboy'),
	clamav = require('clamav.js'),
	config = require("./config.js"),
	fs = require('fs'),
	guid = require('guid'),
	clamd = require('./clamd.js'),
	freshclam = require('./freshclam.js'),
	logger = require('./logger.js'),
	processType = "Server",
	cfenv = require('cfenv'),
	appEnv = cfenv.getAppEnv();
	 WebSocket = require('ws');

// clamav daemon ping function
var ping = () => {
	logger.log(processType, "Pinning clamav daemon")
	return new Promise((resolve, reject) => {
		clamav.ping(config.clamd.port, config.clamd.endPoint, config.clamd.timeout, (err) => {
			if (err) {
				logger.error(processType, "Cant not reach clamav deamon: " + err)
				reject("{'message': 'Cant not reach clamav deamon:" + err + "'}")
			} else {
				logger.log(processType, "Ping clamav daemon with health state")
				resolve("{ 'message': 'Clamav daemon is alive '}")
			}
		})
	})

}
// clamav version function 
var version = () => {
	logger.log(processType, 'Checking version of clamav daemon')
	return new Promise((resolve, reject) => {
		clamav.version(config.clamd.port, config.clamd.endPoint, config.clamd.timeout, (err, version) => {
			if (err) {
				logger.error(processType, "Cant not reach clamav deamon: " + err)
				reject("{'message': 'Cant not reach clamav deamon:" + err + "'}")
			} else {
				logger.log(processType, 'Got virus database version: ' + version)
				resolve("{'message':'clamav deamon virus database version is " + version + "'}")
			}
		}
		)
	})
}

// clamav scanning function 
var scan = (each) => {
	logger.log(processType, "scanning file: " + each.filename)
	return new Promise((resolve, reject) => {

		clamav.createScanner(config.clamd.port, config.clamd.endPoint).scan(each.filepath, (err, object, malicious) => {

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

// main http server 
var server = http.createServer((request, response) => {
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
		logger.log(processType, "Health check of server")
		response.writeHead(200, { 'Content-Type': 'application/json' });
		response.write("{'message':'server is alive'}")
		response.end();
	}
	else if (request.url === '/ping' && request.method === 'GET') {
		logger.log(processType, "Pinning request was submitted, processing .....")
		ping().then(
			(result) => {
				response.writeHead(200, { 'Content-Type': 'application/json' });
				response.write(result)
				response.end();

			}, (reason) => {
				response.writeHead(503, { 'Content-Type': 'application/json' })
				response.write(reason)
				response.end()
			}
		)
	}
	else if (request.url === '/version' && request.method === 'GET') {
		logger.log(processType, "Version check request was submitted, processing .....")
		version().then((result) => {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.write(result)
			response.end();
		}, (reason) => {
			response.writeHead(503, { 'Content-Type': 'application/json' })
			response.write(reason)
			response.end()
		})
	}
	else if (request.url === '/scan' && request.method === 'POST') {
		var temp = undefined
		logger.log(processType, "Scanning request was submitted, processing .....")
		request.on('close', function () {
			logger.error(processType, "client unexpectedly drop connection")
			if (temp != undefined) {
				fs.unlinkSync(temp)
			}
			response.writeHead(400);
			response.end();

		});

		ping().then((result) => {

			var busboy = new Busboy({ 'headers': request.headers, limits: { files: 1 } });
			busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
				temp = fileDir + '/' + guid.raw()
				file.on('data', (data) => {
					fs.appendFileSync(temp, data)
				})


				file.on('end', () => {
					if (fs.existsSync(temp)) {
						hasFile = true
						logger.log(processType, "got file:" + filename + ", saved into " + temp)
						ping().then((result) => {
							scan({ "filename": filename, "filepath": temp }).then(result => {
								fs.unlinkSync(temp)
								response.writeHead(result.code, { 'Content-Type': 'application/json' });
								response.write(JSON.stringify({ message: result.result }))
								response.end()
							}, reason => {
								fs.unlinkSync(temp)
								response.writeHead(reason.code, { 'Content-Type': 'application/json' });
								response.write(JSON.stringify({ message: reason.result }))
								response.end()
							})
						}, (reason) => {
							fs.unlinkSync(temp)
							response.writeHead(503, { 'Content-Type': 'application/json' });
							response.write(reason)
							response.end()


						})
					}

				})



			});

			busboy.on('finish', function () {
				if (!hasFile) {
					logger.error(processType, 'No file was submiited for scanning - bad request');
					response.writeHead(400, { 'Content-Type': 'application/json' });
					response.write("{messege:'no file was submitted'}")
					response.end()
				} else {
					logger.log(processType, 'done parse file');
				}

			});
			request.pipe(busboy)
		}, (reason) => {
			response.writeHead(503, { 'Content-Type': 'application/json' });
			response.write(reason)
			response.end()
		})




	} else if (request.url === '/scan' && request.method === 'GET') {

		if (scan_html != undefined) {
			response.writeHead(200, { 'Content-Type': 'text/html' });
			response.write(scan_html)
			response.end()

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


// pre-process scanning sample html
var scan_html = undefined
fs.readFile('./src/scan.html', (err, data) => {
	if (err) {
		logger.log(processType, 'Missing scan html page, client will not be able to get sample scanning page')
	} else {
		logger.log(processType, 'Sample scan html page processed completed')
		scan_html = data
	}

})
var fileDir = '/tmp/files'
if (!fs.existsSync(fileDir)) {
	fs.mkdirSync(fileDir);
	logger.log(processType, 'Making temp directory for uploaded files: ' + fileDir)
} else {
	logger.log(processType, fileDir + ' already exist')
}


server.listen(appEnv.port, appEnv.bind, function () {
	logger.log(processType, 'Server started on port' + appEnv.port)

})


// web socket
wssMonitor = () => {
	let wss  = new WebSocket('wss://'+config.server.update_controll_endpoint)
	wss.onclose = (event) => {
		logger.log(processType, "Connection to updating server is reset")
		wssMonitor()
	}

	wss.onopen = (event) => {
		logger.log(processType,"Connection to updating server is open")
	}
	wss.on('message', (data) => {

		if(data == "update freshclam"){
			freshclam.run()
		}
	})

	wss.onerror = (err) => {
		logger.error(processType,"Connection to updating server error: " + err)
	}

}
if(config.server.update_controll_enabled){
	wssMonitor()
}

// start clamav daemon and freshclam
clamd(config.clamd.endPoint, config.clamd.restartCounter)
freshclam[config.freshclam.mode](config.freshclam.interval)