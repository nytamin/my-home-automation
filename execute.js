const { getStore } = require("./dataStore")
const { getSensiboStatus, setSensibo } = require("./sensibo")
const { enableActions } = require("./settings")
const { getSmartPlugState, setSmartPlug } = require("./smartPlug")

exports.executeHeater = async function(simulation) {

    const currentHour = new Date()
    currentHour.setMinutes(0)
    currentHour.setSeconds(0)
    currentHour.setMilliseconds(0)

    const o = simulation[currentHour.toISOString()]

    const targetSensiboState =
        o.heaterOn
        ? {
            on: true,
            targetTemperature: Math.min(Math.ceil(o.sensiboTemperature + o.heaterOn * 5), 28),
            mode: 'heat',
            fanLevel: 'auto'
        } :
        o.sensiboTemperature > 22 // When it's hot, keep the fan on
        ? {
            on: true,
            mode: 'fan',
            fanLevel: o.sensiboTemperature > 23 ? 'medium' : 'medium_low' // medium_low
        }
        : {
            on: false,
        }

    const currentState = await getSensiboStatus()
    if (
        !isEqual(currentState, targetSensiboState)
    ) {
        console.log('Setting Sensibo state: ', targetSensiboState)
        console.log('(was: ', currentState, ')')

        if (enableActions) {
            await setSensibo(
                targetSensiboState
            )
        } else console.log('-- Actions are disabled --')

        const store = getStore()
        if (!store.actions) store.actions = []
        store.actions.push({
            time: new Date().toISOString(),
            deviceType: 'sensibo',
            state: targetSensiboState,
            reason: {
                time: currentHour.toISOString(),
                simulation: o
            }
        })
    }
}
exports.executeWaterHeater = async function(simulation) {

    const currentHour = new Date()
    currentHour.setMinutes(0)
    currentHour.setSeconds(0)
    currentHour.setMilliseconds(0)

    const o = simulation[currentHour.toISOString()]


    const targetState = {
        on: o.waterHeaterOn === 1
    }

    const currentState = await getSmartPlugState()

    if (
        !isEqual(currentState, targetState)
    ) {
        console.log('Setting waterheater state: ', targetState)
        console.log('(was: ', currentState, ')')

        if (enableActions   ) {
            await setSmartPlug(
                targetState.on
            )
        } else console.log('-- Actions are disabled --')

        const store = getStore()
        if (!store.actions) store.actions = []
        store.actions.push({
            time: new Date().toISOString(),
            deviceType: 'waterheater',
            state: targetState,
            reason: {
                time: currentHour.toISOString(),
                simulation: o
            }
        })
    }
}
function isEqual (target, current) {
    if (target.on !== current.on) return false
    if (target.on) {
        if (target.mode !== current.mode) return false
        if (target.mode === 'heat') {
            if (target.targetTemperature !== current.targetTemperature) return false
        }
        if (target.mode === 'fan') {
            if (target.fanLevel !== current.fanLevel) return false
        }
    }


    return true
}
