var fs = require('fs')

module.exports= {
    clamav: {
    endPoint: process.env.CLAMAV_ENDPOINT || "127.0.0.1", // ip of clamd 
    port: process.env.CLAMAV_PORT || 3310,
    timeout: process.env.CLAMAV_TIMEOUT || 10000 // 10s before considering it a failed attempt
  }
}