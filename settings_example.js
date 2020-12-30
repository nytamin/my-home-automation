const fetch = require('node-fetch')

exports.getPrice =  async function () {
    // Stub, fill in your prices here:
    return [
        {date, price}
    ]
}
exports.location = {
    lat: 0.000000,
    lon: 0.000000
}
exports.sensibo = {
    apiKey: '', // Sensibo API key
    deviceId: null // sensibo device
}
exports.easee = {
    username: '', // tel-nr (ex: +467123456789)
    password: ''
}
exports.shelly = {
    apiKey: '',
    host: 'https://shelly-20-eu.shelly.cloud',
    deviceId: ''
}
exports.enableActions = true
