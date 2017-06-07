module.exports= {
    clamd: {
    endPoint:"127.0.0.1", // only for local clamd 
    port: process.env.CLAMAV_PORT || 3310, // configure port if necessary 
    timeout: process.env.CLAMAV_TIMEOUT || 10000, // 10s before considering it a failed attempt
    restartCounter:process.env.RESTART_COUNTER || 10 // 
  },freshclam:{
    mode: process.env.FRESHCLAM_MODE || 0, //0 for auto pull, 1 for manaul push 
    interval:process.env.FRESHCLAMV_INTERVAL || '3600000' // auto pull per hour
  },server:{
    update_controll_enabled:  process.env.UPDATE_CONTROLL_ENABLED || true ,
    update_controll_endpoint: process.env.UPDATE_CONTROLL_ENDPOINT 
  }
}