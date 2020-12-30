const { getStore } = require('./dataStore')
const { clone } = require('fast-clone')
var dateFormat = require('dateformat')

exports.optimizeHeater = function () {

    const conditions = {


        minShellyTemperature: 19.0,
        avgShellyTemperature: 15.5,

        minSensiboTemperature: 20,
        maxDaySensiboTemperature: 22,
        maxNightSensiboTemperature: 25,
        allowHeaterOn: (timeStr, sim) => {
            return (
                (
                    new Date(timeStr).getHours() >= 22 ||
                    new Date(timeStr).getHours() < 5 ||
                    sim.sensiboTemperature < conditions.maxDaySensiboTemperature
                ) &&
                sim.sensiboTemperature < conditions.maxNightSensiboTemperature
            )
        },
        preferFactor: (timeStr, sim) => {
            return (
                (
                    new Date(timeStr).getHours() >= 22 ||
                    new Date(timeStr).getHours() < 6
                )
                ? 0.9 // "90%" of the cost
                : 1
            )
        },
        avgSensiboTemperature: 20
    }

    const currentHour = new Date()
    // currentHour.setHours(1) // tmp!
    currentHour.setMinutes(0)
    currentHour.setSeconds(0)
    currentHour.setMilliseconds(0)

    const hoursAhead = 24

    const preparation = prepareSimulation(currentHour, new Date(currentHour.getTime() + hoursAhead * 3600 * 1000))
    let simulation
    let sum

    // Simulate and take action:
    for (let i = 0; i<50; i++) {
        // console.log('------------')

        simulation = simulateHouse(preparation)
        sum = summarize(simulation)

        let turnOnHeater = false
        if (sum.sensiboTemperatureLow < conditions.minSensiboTemperature) {
            turnOnHeater = true
        } else if (sum.sensiboTemperatureAvg < conditions.avgSensiboTemperature) {
            turnOnHeater = true
        } else if (sum.shellyTemperatureLow < conditions.minShellyTemperature) {
            turnOnHeater = true
        } else if (sum.shellyTemperatureAvg < conditions.avgShellyTemperature) {
            turnOnHeater = true
        }

        if (turnOnHeater) {
            if (!turnOnHeaterSomeTime(preparation, simulation, conditions)) {
                // not able to do it, bail out
                console.log('No able to turn on anything more, bailing out..')
                break
            }
        } else {
            // all good
            console.log('OK')
            console.log('sensiboTemperatureLow', Math.round(sum.sensiboTemperatureLow * 100)/100)
            console.log('sensiboTemperatureAvg', Math.round(sum.sensiboTemperatureAvg * 100)/100)
            console.log('shellyTemperatureLow', Math.round(sum.shellyTemperatureLow * 100)/100)
            console.log('shellyTemperatureAvg', Math.round(sum.shellyTemperatureAvg * 100)/100)
            console.log('Optimization done!')
            break
        }
    }

    // Water heare
    for (let i = 0; i< hoursAhead / 2; i++) {
        turnOnWaterHeaterSomeTime(preparation)
    }

    // Finally, update the sime once more.
    simulation = simulateHouse(preparation)
    sum = summarize(simulation)

    const out = [['Time', 'Sensibo', 'Temp', 'Heat', 'Price', 'Outside', 'W.Heat']]
    for (const timeStr of Object.keys(simulation)) {
        const o = simulation[timeStr]
        out.push([
            dateFormat(new Date(timeStr), "HH:MM"),
            Math.round(o.sensiboTemperature * 10)/10,
            Math.round(o.shellyTemperature * 10)/10,
            o.heaterOn,
            `${o.electricalPriceEstimated ? '*' : ''}${o.electricalPrice}`,
            `${o.outsideTemperature} (${o.outsideWind})`,
            o.waterHeaterOn
        ])
    }
    console.table(out)

    console.log('Sum cost', sum.cost)

    return simulation

}

function prepareSimulation(fromDate, toDate) {

    const preparedSimulation = {
    }

    let date = new Date(fromDate)
    date.setMinutes(0)
    date.setSeconds(0)
    date.setMilliseconds(0)
    for (let i = 0; i< 100; i++) {


        const forecast = getForecast(date)

        const electricPrice = getElectricalPrice(date)

        const o = {
            outsideTemperature: forecast.temperature !== undefined ? forecast.temperature : null,
            outsideWind: forecast.windSpeed !== undefined ? forecast.windSpeed : null ,

            sensiboTemperature: i === 0 ? getSensiboTemperature() : null,

            shellyTemperature: i === 0 ? getShellyTemperature() : null,

            electricalPrice: electricPrice.price,
            electricalPriceEstimated: electricPrice.estimated,

            heaterOn: 0,
            waterHeaterOn: 0,
            cost: null
        }

        // overrider, temp:
        // o.outsideTemperature = 0
        // o.outsideWind = 0

        preparedSimulation[date.toISOString()] = o


        // Finally:
        date = new Date(date.getTime() + 3600 * 1000) // advance an hour
        if (date.getTime() >= toDate.getTime()) break
    }

    return preparedSimulation

}
function getElectricalPrice(date) {
    const store = getStore()
    let price = store.electricalPrices.times[date.toISOString()]
    let estimated = false

    if (!price) {
        // Guess tomorrows price:
        const midnightToday = new Date(date)
        midnightToday.setHours(-1)
        const midnightYeterday = new Date(midnightToday.getTime() - 24 * 3600 * 1000)

        const priceAtMidnightToday = store.electricalPrices.times[midnightToday.toISOString()]
        const priceAtMidnightYesterday = store.electricalPrices.times[midnightYeterday.toISOString()]


        if (priceAtMidnightToday && priceAtMidnightYesterday) {
            const diff = priceAtMidnightToday - priceAtMidnightYesterday

            const sameTimeYesterday = new Date(date.getTime() - 24 * 3600 * 1000)
            const priceYesterday = store.electricalPrices.times[sameTimeYesterday.toISOString()]
            if (priceYesterday) {
                price = Math.round((priceYesterday + diff)*100) / 100
                estimated = true
            }
        }

    }


    return {
        price: price || null,
        estimated: estimated
    }
}
function getForecast(date) {
    const store = getStore()
    return store.weather.forecasts[date.toISOString()] || {}
}
function getSensiboTemperature() {
    const store = getStore()
    const times = Object.keys(store.sensiboTemperatures.times).map(timeStr => new Date(timeStr).getTime()).sort((a, b) => a-b)

    const lastTimeStr = new Date(times[times.length -1]).toISOString()
    return store.sensiboTemperatures.times[lastTimeStr]
}
function getShellyTemperature() {
    const store = getStore()
    const times = Object.keys(store.shelly.times).map(timeStr => new Date(timeStr).getTime()).sort((a, b) => a-b)

    const lastTimeStr = new Date(times[times.length -1]).toISOString()
    return store.shelly.times[lastTimeStr].temperature
}

function simulateHouse(preparation) {
    const sim = clone(preparation)

    const electricalCost = 1.0
    const heaterPower = 2.5 // kw
    const waterHeaterPower = 1.0// kw
    const otherHeaterPower = 6 // kw

    const houseSize = 8
    const heaterGainTemp = heaterPower * 4 / houseSize // ~1.2 degree / hour
    const otherHeaterGainTemp = otherHeaterPower * 1 / houseSize
    const firePlaceGainTemp = 8 / houseSize // 0.9 degree / hour

    let first = true
    let prev = null
    for (const dateStr of Object.keys(sim)) {
        const date = new Date(dateStr)
        const o = sim[dateStr]

        // outsideTemperature
        // outsideWind
        // sensiboTemperature
        // electicalPrice
        // heaterOn
        // waterHeaterOn

        if (o.sensiboTemperature === null && prev) {

            {
                // Downstairs:

                o.fireplaceOn = (
                    [8,9,10,11,17,18,19,20,21].includes(date.getHours()) &&
                    prev.sensiboTemperature < 23
                ) ? 1 : 0

                const heaterGain = o.heaterOn * heaterGainTemp
                const fireplaceGain = o.fireplaceOn * firePlaceGainTemp

                const heatLoss     = Math.pow(((prev.sensiboTemperature - prev.outsideTemperature) * 0.1), 2) * -0.04
                const heatLossWind = Math.pow(((prev.sensiboTemperature - prev.outsideTemperature) * 0.1), 2) * Math.log(prev.outsideWind + 5) * -0.07

                o.sensiboTemperature = prev.sensiboTemperature + (
                    heaterGain +
                    fireplaceGain +
                    heatLoss +
                    heatLossWind
                )
            }
            {
                // Upstairs:
                o.otherHeatersOn = Math.min(Math.max((17 - prev.shellyTemperature) / 7, 0), 1)
                const otherHeaterGain = o.otherHeatersOn * otherHeaterGainTemp

                const heatLoss     = Math.pow(((prev.sensiboTemperature - prev.outsideTemperature) * 0.1), 2) * -0.02
                const heatLossWind = Math.pow(((prev.sensiboTemperature - prev.outsideTemperature) * 0.1), 2) * Math.log(prev.outsideWind + 5) * -0.03
                const heatTransfer = -(prev.shellyTemperature - prev.sensiboTemperature) * 0.12
                // const heaterGain = o.heaterOn * heaterGainTemp

                o.shellyTemperature = prev.shellyTemperature + (
                    // otherHeaterGain +
                    heatLoss +
                    heatLossWind +
                    heatTransfer
                )

            }

            o.cost = (
                o.heaterOn * heaterPower * electricalCost +
                o.otherHeatersOn * otherHeaterPower * electricalCost +
                o.waterHeaterOn * waterHeaterPower * electricalCost
            )
        }


        // Finally:
        prev = o
    }
    return sim
}
function summarize (sim) {
    const sum = {
        cost: 0,
        sensiboTemperatureEnd: 0,
        sensiboTemperatureAvg: 0,
        sensiboTemperatureLow: Number.POSITIVE_INFINITY,
        sensiboTemperatureHigh: Number.NEGATIVE_INFINITY,

        shellyTemperatureEnd: 0,
        shellyTemperatureAvg: 0,
        shellyTemperatureLow: Number.POSITIVE_INFINITY,
        shellyTemperatureHigh: Number.NEGATIVE_INFINITY
    }
    let i = 0
    for (const timeStr of Object.keys(sim)){
        const o = sim[timeStr]
        i++
        sum.cost += o.cost
        sum.sensiboTemperatureEnd = o.sensiboTemperature
        sum.sensiboTemperatureAvg += o.sensiboTemperature
        sum.sensiboTemperatureLow = Math.min(sum.sensiboTemperatureLow, o.sensiboTemperature)
        sum.sensiboTemperatureHigh = Math.max(sum.sensiboTemperatureHigh, o.sensiboTemperature)

        sum.shellyTemperatureEnd = o.shellyTemperature
        sum.shellyTemperatureAvg += o.shellyTemperature
        sum.shellyTemperatureLow = Math.min(sum.shellyTemperatureLow, o.shellyTemperature)
        sum.shellyTemperatureHigh = Math.max(sum.shellyTemperatureHigh, o.shellyTemperature)

    }
    sum.sensiboTemperatureAvg /= i
    sum.shellyTemperatureAvg /= i
    return sum
}
function turnOnHeaterSomeTime(preparation, simulation, conditions) {

    let lowestCost = Number.POSITIVE_INFINITY
    let lowestCostTimeStr = null
    for (const timeStr of Object.keys(preparation)) {
        const o = preparation[timeStr]
        const sim = simulation[timeStr]

        if (
            o.heaterOn < 1 &&
            conditions.allowHeaterOn(timeStr, sim)
        ) {
            const factor = (conditions.preferFactor && conditions.preferFactor(timeStr, sim)) || 1
            let cost = o.electricalPrice
            if (cost === null) cost = 9999 + sim.sensiboTemperature

            cost *= factor
            if (cost < lowestCost) {
                lowestCost = cost
                lowestCostTimeStr = timeStr
            }
        }

    }
    if (lowestCostTimeStr) {
        preparation[lowestCostTimeStr].heaterOn += 0.25

        return true
    } else {
        return false // unable, bail out
    }
}
function turnOnWaterHeaterSomeTime(preparation) {

    let lowestCost = Number.POSITIVE_INFINITY
    let lowestCostTimeStr = null
    for (const timeStr of Object.keys(preparation)) {
        const o = preparation[timeStr]

        if (
            o.waterHeaterOn !== 1
        ) {
            let cost = o.electricalPrice
            if (cost < lowestCost) {
                lowestCost = cost
                lowestCostTimeStr = timeStr
            }
        }

    }
    if (lowestCostTimeStr) {
        preparation[lowestCostTimeStr].waterHeaterOn = 1

        return true
    } else {
        return false // unable, bail out
    }
}
