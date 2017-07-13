module.exports= {
    clamd: {
    endPoint: process.env.CLAMAV_ENDPOINT || "127.0.0.1", // ip of clamd 
    port: process.env.CLAMAV_PORT || 3310,
    timeout: process.env.CLAMAV_TIMEOUT || 10000, // 10s before considering it a failed attempt
    restartCounter:process.env.RESTART_COUNTER || 10
  },freshclam:{
    mode: process.env.FRESHCLAM_MODE || 1,
    interval:process.env.FRESHCLAMV_INTERVAL || '3600000'
  },server:{
    port:process.env.SERVER_PORT || 8080
  }
}