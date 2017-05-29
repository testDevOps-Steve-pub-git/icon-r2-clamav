var http = require('http'),
	Busboy = require('busboy'),
	spawn = require('child_process').spawn,
	exec = require('child_process').exec,
	clamav = require('clamav.js');
	config = require("./config.js");

var ping = () => {
	console.log("Pinning clamav daemon")
	return new Promise((resolve, reject) => {
		clamav.ping(config.clamav.port, config.clamav.endPoint, config.clamav.timeout, (err) => {
			if (err) {
				reject()
			} else {
				resolve()
			}
		})
	})

}
var version = () => {
	console.log("checking version of clamav daemon")
	return new Promise((resolve, reject) => {
		clamav.version(config.clamav.port, config.clamav.endPoint, config.clamav.timeout, (err, version) => {
			if (err) {
				reject()
			} else {
				resolve(version)
			}
		}
		)
	})
}

var scan = (each) => {
	console.log("scanning file: "+ each.filename)
	return new Promise((resolve, reject) => {
		ping().then((result)=>{
			clamav.createScanner(config.clamav.port, config.clamav.endPoint).scan(each.fileStream, (err, object, malicious) => {

					if (err) {
						reject({ 'result': "error occurs while scanning: " + each.filename, 'error': JSON.stringify(err), "code": 500 })
					} else if (malicious) {
						resolve({ 'result': malicious + " found in file: " + each.filename, 'virus': malicious, "code": 406 })
					} else {
						resolve({ 'result': "No virus found in the file: " + each.filename, "code": 200 })
					}

				})
		},(reason)=>{
			reject({ "result": "Cant not reach clamav deamon ", "code": 503 })
		})
	}) 


}

var server = http.createServer((request, response) => {
	var hasFile = false
	if(request.url === '/' && request.method === 'GET'){
		response.writeHead(200, { 'Content-Type': 'application/json' });
		response.write("{'message':'server is alive'}")
		response.end();
	}
	else if (request.url === '/ping' && request.method === 'GET') {
		console.log("Pinning request was submitted, processing .....")
		ping().then(
			(result) => {
				response.writeHead(200, { 'Content-Type': 'application/json' });
				response.write("{'message':'clamav deamon is healthy'}")
				response.end();
				console.log("health check passed")
			}, (reason) => {
				response.writeHead(404, { 'Content-Type': 'application/json' })
				response.write("{'message':'clamav deamon is not alive, waiting for it to start'}")
				response.end()
				console.log("health check failed")
			}
		)
	}
	else if (request.url === '/version' && request.method === 'GET') {
		console.log("Version check request was submitted, processing .....")
		version().then((version) => {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.write("{'message':'clamav deamon version is " + version + "'}")
			response.end();
			console.log("version: " + version)
		}, (reason) => {
			response.writeHead(404, { 'Content-Type': 'application/json' })
			response.write("{'message':'clamav deamon is not alive, waiting for it to restart'}")
			response.end()
			console.log("checking version failed")
		})
	}
	else if (request.url === '/scan' && request.method === 'POST') {
		console.log("Scanning request was submitted, processing .....")
		var busboy = new Busboy({ 'headers': request.headers, limits: { files: 1 } });
		request.on('close', function () {
			console.log("client unexpectedly drop connection")
			response.writeHead(400);
			response.end();

		});

		request.on('end', () => {
			if (!hasFile) {
				console.log("bad request")
				response.writeHead(400);
				response.end();
			} else {
				console.log("request completed, processing file")
			}

		})


		busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
			
			hasFile = true
			scan({ "filename": filename, "fileStream": file }).then(result => {

				response.writeHead(result.code, { 'Content-Type': 'application/json' });
				response.write(JSON.stringify({ result: result.result }))
				response.end()
			}, reason => {

				response.writeHead(reason.code, { 'Content-Type': 'application/json' });
				response.write(JSON.stringify({ result: reason.result }))
				response.end()
			})

		});

		request.pipe(busboy)
	} else {
		response.writeHead(400);
		response.end();
		console.log('Invalid action: ' + request.url);
	}
});



server.listen(8080)



let base = "/tmp/app/clamav/bin/"
let clamdBase = "/tmp/app/clamav/sbin/"




// setup clamd
var clamdMonitor = () => {
	var clamd = spawn( clamdBase +'clamd')
	console.log("starting clamav deamon")
	clamd.on('error', (error) => {
		console.log("error initializing clamav deamon, shutting down node js http layer",error)
		process.exit(1)
	})
	clamd.on('exit', (code, signal) => {
		console.log('clamd exited, respawning clamd')
		clamdMonitor()

	})

	clamd.on('close', (code, signal) => {
		console.log('clamd exited, respawning clamd')
		clamdMonitor()
	})
}




// set up freshclam

let freshclam = spawn(base + 'freshclam')
freshclam.on('error', (error) => {
	console.log("error creating freshclam, unable to get new virus definitions",error)
	process.exit(1)
})
freshclam.on('exit', (code, signal) => {
	console.log('virus signature database updated succeffully')

	console.log('schedule freshclam')
	setInterval(() => {
	let freshclam = spawn(base + 'freshclam')

		freshclam.on('error', (error) => {
			console.log("error creating freshclam, unable to get new virus definitions",error)
		})
		freshclam.on('exit', (code, signal) => {
			console.log('freshclam started succeffully')

		})
	}, 3600000)
	console.log('starring clamav daemon')
	clamdMonitor()
})

