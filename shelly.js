const { URLSearchParams } = require('url');
const fetch = require('node-fetch')
const { getStore } = require('./dataStore')
const { shelly } = require('./settings')

exports.updateShellyTemperature = async function () {

    const store = getStore()

    if (!store.shelly) store.shelly = {times: {}}
    if (Date.now() - (store.shelly.lastUpdated || 0) > 0.5 * 3600 * 1000) { // 1 hours

        console.log('Updating Shelly temperature')

        // store.sensiboTemperatures.times = newTimes
        const temp = await getTemperature()
        if (temp) {

            const d = new Date(temp.time)
            d.setMinutes(0)
            d.setSeconds(0)
            d.setMilliseconds(0)
            store.shelly.times[d.toISOString()] = {
                temperature: temp.temperature,
                time: temp.time
            }
        }

        store.shelly.lastUpdated = Date.now()
    }



}
async function getTemperature() {

    const params = new URLSearchParams();
    params.append('auth_key', shelly.apiKey);
    params.append('id', shelly.deviceId);

    const reply = await (await fetch(`${shelly.host}/device/status`,{
        method: 'post',
        body: params
    })).json()

    if (
        reply.data &&
        reply.data.device_status &&
        reply.data.device_status.tmp &&
        reply.data.device_status.tmp.is_valid
    ) {
        const tmp = reply.data.device_status.tmp
        return {
            temperature: reply.data.device_status.tmp.tC,
            time: new Date(`${reply.data.device_status._updated} GMT`).toISOString()
        }
    }


}
