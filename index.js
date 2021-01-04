const fs = require('fs')

console.log('===========================================================')
console.log('My Home Automation')
console.log('===========================================================')


if (!fs.existsSync('./settings.js')) {
    fs.copyFileSync('./settings_example.js', './settings.js')

    console.log('Please fill in settings.js file!')
    process.exit(-1)

} else {


    const Cron = require('cron')
    const { updateElecticalPrice } = require('./electricalPrice')
    const { updateStore } = require('./dataStore')
    const { updateWeather } = require('./weather')
    const { updateSensiboTemperature } = require('./sensibo')
    const { optimizeHeater } = require('./optimizer')
    const { executeHeater, executeWaterHeater } = require('./execute')
    const { updateEaseeStatus } = require('./easee')
    const { updateShellyTemperature } = require('./shelly')



    async function hourlyJob () {
        console.log('*** Hourly job ***')

        await updateSensiboTemperature()
        await updateShellyTemperature()

        // await updateEaseeStatus() // todo: implement

        // TODO: updateTemperaturemeasure


        const simulation = optimizeHeater()

        await executeHeater(simulation)
        await executeWaterHeater(simulation)

        // Finally:
        updateStore()
    }

    // Set up cron jobs:
    const hourly = new Cron.CronJob('2 * * * *', () => {
        hourlyJob().catch(console.error)
    }, undefined, true, 'Europe/Stockholm', undefined, false)

    new Cron.CronJob('1 15 * * *', () => {
        updateElecticalPrice().catch(console.error)
    }, undefined, true, 'Europe/Stockholm', undefined, false)

    new Cron.CronJob('1 15 * * *', () => {
        updateWeather().catch(console.error)
    }, undefined, true, 'Europe/Stockholm', undefined, false)

    const startup = async () => {
        // On startup:
        await updateElecticalPrice()
        await updateWeather()
        await hourlyJob()
    }
    startup().catch(console.error)
}

