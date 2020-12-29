var Cron = require('cron')
const { updateElecticalPrice } = require('./electricalPrice')
const { updateStore } = require('./dataStore')
const { updateWeather } = require('./weather')
const { updateSensiboTemperature } = require('./sensibo')
const { optimizeHeater } = require('./optimizer')
const { executeHeater } = require('./execute')
const { updateEaseeStatus } = require('./easee')

console.log('===========================================================')
console.log('My Home Automation')
console.log('===========================================================')


async function hourlyJob () {
    console.log('*** Hourly job ***')

    // Update electrical prices:
    await updateElecticalPrice()

    await updateWeather()

    await updateSensiboTemperature()

    // await updateEaseeStatus() // todo: implement

    // TODO: updateTemperaturemeasure

    const simulation = optimizeHeater()

    await executeHeater(simulation)

    // Finally:
    updateStore()
}

// Set up cron jobs:
var hourly = new Cron.CronJob('1 * * * *', () => {
    hourlyJob().catch(console.error)
}, undefined, true, 'Europe/Stockholm', undefined, true)
