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
		response.write("{'message':'server is alive'}")
		response.end();
	}
	else if (request.url === '/ping' && request.method === 'GET') {
		logger.debug(processType, "Pinning request was submitted, processing .....")
		clamd.ping(config.clamd.port, config.clamd.endPoint, config.clamd.timeout).then(
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
		logger.debug(processType, "Version check request was submitted, processing .....")
		clamd.version(config.clamd.port, config.clamd.endPoint, config.clamd.timeout).then((result) => {
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
		logger.debug(processType, "Scanning request was submitted, processing .....")
		request.on('close', function () {
			logger.error(processType, "client unexpectedly drop connection")
			if (temp != undefined) {
				fs.unlinkSync(temp)
			}
			response.writeHead(400);
			response.end();

		});

		clamd.ping(config.clamd.port, config.clamd.endPoint, config.clamd.timeout).then((result) => {

			var busboy = new Busboy({ 'headers': request.headers, limits: { files: 1 } });
			busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
				temp = fileDir + '/' + guid.raw()
				file.on('data', (data) => {
					fs.appendFileSync(temp, data)
				})


				file.on('end', () => {
					if (fs.existsSync(temp)) {
						hasFile = true
						logger.debug(processType, "got file:" + filename + ", saved into " + temp)
						clamd.ping(config.clamd.port, config.clamd.endPoint, config.clamd.timeout).then((result) => {
							clamd.scan(config.clamd.port, config.clamd.endPoint, { "filename": filename, "filepath": temp }).then(result => {
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
					logger.debug(processType, 'done parse file');
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
		logger.debug(processType, 'Sample scan html page processed completed')
		scan_html = data
	}

})
// temp directory for files
var fileDir = '/tmp/files'
if (!fs.existsSync(fileDir)) {
	fs.mkdirSync(fileDir);
	logger.debug(processType, 'Making temp directory for uploaded files: ' + fileDir)
} else {
	logger.debug(processType, fileDir + ' already exist')
}


server.listen(appEnv.port, appEnv.bind, function () {
	logger.log(processType, 'Main Http Server is listening on ' + appEnv.bind+':'+ appEnv.port)

})



// start clamav daemon
if(!appEnv.isLocal){
clamd.clamdStart(config.clamd.endPoint,config.clamd.restartTime)
logger.log(processType, 'Starting clamav deamon')
 }else{
 	logger.log(processType,"local environment will not enable clamav daemon")
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
	wssStart(config.updateControll.endpoint,config.updateControll.restartTime,config.clamd)
	logger.log(processType, 'Starting Updating controll process')

} else {
	logger.log(processType, 'Virus Update Controll is disabled')
}
