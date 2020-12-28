const fetch = require('node-fetch')
const { sensibo } = require('./settings')
const { getStore } = require('./dataStore')

// API documentation: https://sensibo.github.io/

exports.updateSensiboTemperature = async function () {
    const store = getStore()

    if (!sensibo.deviceId) {
        const reply = await (await fetch(`https://home.sensibo.com/api/v2/users/me/pods?fields=*&apiKey=${sensibo.apiKey}`,{
            method: 'get'
        })).json()
        if (reply.status === 'success') {

            console.log('Found Sensibo devides, update settings.sensibo.deviceId!')
            reply.result.forEach(device => {
                console.log(device.id, device.location.name, device.location.address)
            })

        } else throw new Error(`Sensibo: ${reply.status}`)
    }

    // const reply = await (await fetch(`https://home.sensibo.com/api/v2/pods/${sensibo.deviceId}?fields=*&apiKey=${sensibo.apiKey}`,{
    //     method: 'get'
    // })).json()
    // if (reply.status === 'success') {
    // } else throw new Error(`Sensibo: ${reply.status}`)


    if (!store.sensiboTemperatures) store.sensiboTemperatures = {times: {}}
    if (Date.now() - (store.sensiboTemperatures.lastUpdated || 0) > 0.5 * 3600 * 1000) { // 1 hours

        console.log('Updating Sensibo temperatures')

        const historicalMeasurements = await (await fetch(`https://home.sensibo.com/api/v2/pods/${sensibo.deviceId}/historicalMeasurements?fields=*&apiKey=${sensibo.apiKey}`,{
            method: 'get'
        })).json()

        if (historicalMeasurements.status === 'success') {

            historicalMeasurements.result.temperature.forEach(entry => {
                const timeStr = new Date(entry.time).toISOString()
                store.sensiboTemperatures.times[timeStr] = entry.value
            })
            const newTimes = {}
            let prevValue = Number.NEGATIVE_INFINITY
            for (const timeStr of Object.keys(store.sensiboTemperatures.times)) {
                const temperature = store.sensiboTemperatures.times[timeStr]
                if (Math.abs(temperature - prevValue) >= 0.5) { // only update when it has changed a bit
                    newTimes[timeStr] = temperature
                    prevValue = temperature
                }
            }
            store.sensiboTemperatures.times = newTimes

            store.sensiboTemperatures.lastUpdated = Date.now()
        } else {
            throw new Error(`Sensibo: ${reply.status}`)
        }
    }
}

exports.getSensiboStatus = async function() {

    const reply = await (await fetch(`https://home.sensibo.com/api/v2/pods/${sensibo.deviceId}?fields=*&apiKey=${sensibo.apiKey}`,{
        method: 'get'
    })).json()
    if (reply.status === 'success') {

        return reply.result.acState
    } else throw new Error(`Sensibo: ${reply.status}`)
}
exports.setSensibo = async function(targetState) {

    const reply = await (await fetch(`https://home.sensibo.com/api/v2/pods/${sensibo.deviceId}/acStates?apiKey=${sensibo.apiKey}`,{
        method: 'post',
        body:    JSON.stringify({
            acState: targetState
            // acState: {
            //     on: on,
            //     mode: mode,
            //     fanLevel: 'auto',
            //     targetTemperature: targetTemperature,
            //     temperatureUnit: 'C',
            //     swing: 'stopped'
            //     }
        }),
        headers: { 'Content-Type': 'application/json' },
    })).json()
    if (reply.status === 'success') {
        // console.log('reply', reply)
    } else throw new Error(`Sensibo: ${reply.status}`)
}
