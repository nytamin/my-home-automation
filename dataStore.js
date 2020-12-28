var fs = require('fs')

const dataStoreFile = './dataStore.json'

let dataStore = {}
if (fs.existsSync(dataStoreFile)) {
    const str = fs.readFileSync(dataStoreFile)

    dataStore = str.length ? JSON.parse(str) : {}
}

exports.getStore = function () {
    return dataStore
}


exports.updateStore = function () {
    fs.writeFileSync(dataStoreFile, JSON.stringify(dataStore, null, 2))
}
