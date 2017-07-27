module.exports = {
    log: (typeProcess, message) => {
        for (var piece of message.split('\n')) {
            if (piece.length > 0) {
                console.log(JSON.stringify({ 'Process type': typeProcess, 'Log': piece, 'Severity': "Info" }))
            }
        }

    },
    error: (typeProcess, message) => {
        for (var piece of message.split('\n')) {
            if (piece.length > 0) {
                console.error(JSON.stringify({ 'Process type': typeProcess, 'Log': piece, 'Severity': "Error" }))
            }
        }
    }
}



