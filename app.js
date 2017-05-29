var http = require('http'),
	Busboy = require('busboy'),
	spawn = require('child_process').spawn,
	exec = require('child_process').exec,
	clamav = require('clamav.js'),
	config = require("./config.js"),
	fs = require('fs');

var scan_html = undefined
fs.readFile('./scan.html',(err,data)=>{
			if(err){
				console.log('missing scan html page, client will not be ablt to get scanning page')
			}else{
				scan_html = data
			}
			
})


var ping = () => {
	console.log("Pinning clamav daemon")
	return new Promise((resolve, reject) => {
		clamav.ping(config.clamav.port, config.clamav.endPoint, config.clamav.timeout, (err) => {
			if (err) {
				reject("{'message': 'Cant not reach clamav deamon ' }")
			} else {
				resolve("{ 'message': 'Clamav daemon is alive '}")
			}
		})
	})

}
var version = () => {
	console.log("checking version of clamav daemon")
	return new Promise((resolve, reject) => {
		clamav.version(config.clamav.port, config.clamav.endPoint, config.clamav.timeout, (err, version) => {
			if (err) {
				reject("{'message': 'Cant not reach clamav deamon' }")
			} else {
				resolve("{'message':'clamav deamon version is " + version + "'}")
			}
		}
		)
	})
}

var scan = (each) => {
	console.log("scanning file: " + each.filename)
	return new Promise((resolve, reject) => {
		ping().then((result) => {
			clamav.createScanner(config.clamav.port, config.clamav.endPoint).scan(each.fileStream, (err, object, malicious) => {

				if (err) {
					reject({ 'result': "error occurs while scanning: " + each.filename, 'error': JSON.stringify(err), "code": 500 })
				} else if (malicious) {
					resolve({ 'result': malicious + " found in file: " + each.filename, 'virus': malicious, "code": 406 })
				} else {
					resolve({ 'result': "No virus found in the file: " + each.filename, "code": 200 })
				}

			})
		}, (reason) => {
			reject(reason)
		})
	})


}

var server = http.createServer((request, response) => {
	var hasFile = false
	if (request.url === '/' && request.method === 'GET') {
		response.writeHead(200, { 'Content-Type': 'application/json' });
		response.write("{'message':'server is alive'}")
		response.end();
	}
	else if (request.url === '/ping' && request.method === 'GET') {
		console.log("Pinning request was submitted, processing .....")
		ping().then(
			(result) => {
				response.writeHead(200, { 'Content-Type': 'application/json' });
				response.write(result)
				response.end();
				
			}, (reason) => {
				response.writeHead(404, { 'Content-Type': 'application/json' })
				response.write(reason)
				response.end()
			}
		)
	}
	else if (request.url === '/version' && request.method === 'GET') {
		console.log("Version check request was submitted, processing .....")
		version().then((result) => {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.write(result)
			response.end();
			console.log("version: " + version)
		}, (reason) => {
			response.writeHead(404, { 'Content-Type': 'application/json' })
			response.write(reason)
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
				response.write(JSON.stringify({ message: result.result }))
				response.end()
			}, reason => {

				response.writeHead(reason.code, { 'Content-Type': 'application/json' });
				response.write(JSON.stringify({ message: reason.result }))
				response.end()
			})

		});

		request.pipe(busboy)
	} else if(request.url === '/scan' && request.method === 'GET'){
	
		if(scan_html!=undefined){
			response.writeHead(200,{'Content-Type': 'text/html'});
			response.write(scan_html)
			response.end()
		
		}else{
			response.writeHead(200,{'Content-Type': 'text/html'});
			response.end()
		}
	}else {
		response.writeHead(400);
		response.end();
		console.log('Invalid action: ' + request.url);
	}
});



server.listen(8080)



let base =  process.env.BASE || "/tmp/app/clamav/bin/"
let clamdBase = process.env.CLAMDBASE || "/tmp/app/clamav/sbin/"




// setup clamd
var clamdMonitor = () => {
	var clamd = spawn(clamdBase + 'clamd')
	console.log("starting clamav deamon")
	clamd.on('error', (error) => {
		console.log("error initializing clamav deamon, shutting down node js http layer", error)
		process.exit(1)
	})
	clamd.on('exit', (code, signal) => {
		if (code != 0) {
			console.log('clamd exited, respawning clamd')
			clamdMonitor()
		}


	})

	clamd.on('close', (code, signal) => {
		if (code != 0) {
			console.log('clamd exited, respawning clamd')
			clamdMonitor()
		}

	})
	clamd.stderr.on('data', (err) => {

		console.log(JSON.stringify({ process_type: 'Clam daemon', messege: err.toString('utf8'), severity: 'Error' }))
	})

	clamd.stdout.on('data', (data) => {

		console.log(JSON.stringify({ process_type: 'Clam daemon', messege: data.toString('utf8'), severity: 'Info' }))
	})

}




// set up freshclam

let freshclam = spawn(base + 'freshclam')
freshclam.on('error', (error) => {
	console.log("error creating freshclam, unable to get new virus definitions", error)
	process.exit(1)
})

freshclam.stderr.on('data', (err) => {

	console.log(JSON.stringify({ process_type: 'Virus database update', messege: err.toString('utf8'), severity: 'Error' }))
})

freshclam.stdout.on('data', (data) => {

	console.log(JSON.stringify({ process_type: 'Virus database update', messege: data.toString('utf8'), severity: 'Info' }))
})


freshclam.on('exit', (code, signal) => {
	if (code == 0) {
		console.log('virus signature database updated succeffully')

		console.log('schedule freshclam')
		setInterval(() => {
			let freshclam = spawn(base + 'freshclam')

			freshclam.on('error', (error) => {
				console.log("error creating freshclam, unable to get new virus definitions", error)
			})
			freshclam.on('exit', (code, signal) => {
				if (code == 0) {
					console.log('freshclam started succeffully')
				} else {
					console.log('freshclam exits with code:' + code)
				}


			})

			freshclam.stderr.on('data', (err) => {

				console.log(JSON.stringify({ process_type: 'Virus database update', messege: err.toString('utf8'), severity: 'Error' }))
			})

			freshclam.stdout.on('data', (data) => {

				console.log(JSON.stringify({ process_type: 'Virus database update', messege: data.toString('utf8'), severity: 'Info' }))
			})


		}, 3600000)
		console.log('starting clamav daemon')
		clamdMonitor()
	}

})

