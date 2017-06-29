module.exports= {
    clamd: {
    endPoint:"127.0.0.1", // only for local clamd 
    port: process.env.CLAMAV_PORT || 3310, // configure port if necessary 
    timeout: process.env.CLAMAV_TIMEOUT || 10000, // 10s before considering it a failed attempt
    restartTime:process.env.CLAMAV_RESTART_TIME || 5, 
  },freshclam:{
    auto_enabled: process.env.FRESHCLAM_AUTO_ENABLED || 0, // default to disable 0=disable, other enable
    interval:process.env.FRESHCLAMV_INTERVAL || '3600000', // auto pull per hour
    private_mirror: process.env.PRIVATE_MIRROR || undefined
  },server:{
    debug: process.env.DEBUG || 1, // debug message will be logged 0=disable, other enable
  },updateControll:{
    enabled:  process.env.UPDATE_CONTROLL_ENABLED || 0 , // default to enable 0=disable, other enable
    endpoint: process.env.UPDATE_CONTROLL_ENDPOINT || undefined ,  // getting enviroment  injected endpoint
    restartTime:process.env.UPDATE_CONTROLL_RESTART_TIME || 5, 
  }
}