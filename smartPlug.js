const { smartPlug } = require('./settings')
const TPLinkSmartPlug = require('tplink-smartplug-node')

exports.setSmartPlug = async function (on) {

    const tp = new TPLinkSmartPlug(smartPlug.ip)

    if (on) {

        await tp.turnOn()
    } else {
        await tp.turnOff()

    }
}
exports.getSmartPlugState = async function () {

    const tp = new TPLinkSmartPlug(smartPlug.ip)

    const info = await tp.query()
    return {
        on: info.system.get_sysinfo.relay_state === 1
    }

}
