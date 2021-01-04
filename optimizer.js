const { getStore } = require('./dataStore')
const { clone } = require('fast-clone')
var dateFormat = require('dateformat')

exports.optimizeHeater = function () {

    const conditions = {


        minShellyTemperature: 18.0,
        avgShellyTemperature: 19.0,

        minSensiboTemperature: 18,
        maxDaySensiboTemperature: 23,
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

    const hoursBack = 24
    const hoursAhead = 24

    const startHour = new Date(currentHour.getTime() - hoursBack  * 3600 * 1000)
    const endHour   = new Date(currentHour.getTime() + hoursAhead * 3600 * 1000)

    const preparation = prepareSimulation(startHour, endHour, currentHour)
    let simulation
    let sum

    const hourCount = Object.keys(preparation).length
    // Simulate and take action:
    for (let i = 0; i < hourCount * 10; i++) {
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
            console.log('Optimization done!')
            break
        }
    }
    console.log(`sensiboTemperatureLow ${round(sum.sensiboTemperatureLow)} (min: ${round(conditions.minSensiboTemperature)})`)
    console.log(`sensiboTemperatureAvg ${round(sum.sensiboTemperatureAvg)} (min: ${round(conditions.avgSensiboTemperature)})`)
    console.log(`shellyTemperatureLow  ${round(sum.shellyTemperatureLow) } (min: ${round(conditions.minShellyTemperature)})`)
    console.log(`shellyTemperatureAvg  ${round(sum.shellyTemperatureAvg) } (min: ${round(conditions.avgShellyTemperature)})`)

    // Water heater:
    turnOnWaterHeater(preparation, startHour, endHour)


    // Finally, update the sime once more.
    simulation = simulateHouse(preparation)
    sum = summarize(simulation)

    const out = [['Time', 'Sensibo', 'Temp', 'Heat', 'Price', 'Outside', 'W.Heat']]
    for (const timeStr of Object.keys(simulation)) {
        const o = simulation[timeStr]
        if (timeStr === currentHour.toISOString()) {
            out.push([])
        }
        out.push([
            dateFormat(new Date(timeStr), hourCount <= 48 ? 'HH:MM' : 'yyyy-mm-dd HH:MM'),
            // dateFormat(new Date(timeStr), "HH:MM"),
            formatV(o.sensiboTemperature, o.sensiboTemperatureEstimated),
            formatV(o.shellyTemperature, o.shellyTemperatureEstimated),
            round(o.heaterOn),
            formatV(o.electricalPrice, o.electricalPriceEstimated),
            `${o.outsideTemperature} (${o.outsideWind})`,
            o.waterHeaterOn,
        ])
    }
    console.table(out)

    console.log('Sum cost', round(sum.cost))

    return simulation

}

function formatV(val, valEst) {
    if (val === null) return null
    else if (valEst) return `*${round(val)}`
    else return round(val)
}
function round(v) {
    return Math.round(v * 10)/10
}

function prepareSimulation(fromDate, toDate, currentHour) {

    const preparedSimulation = {
    }

    let date = new Date(fromDate)
    date.setMinutes(0)
    date.setSeconds(0)
    date.setMilliseconds(0)


    for (let i = 0; i < 1000; i++) {

        const inThePast = date.getTime() < currentHour.getTime()
        const inThePastOrNow = date.getTime() <= currentHour.getTime()

        const forecast = getForecast(date)

        const electricPrice = getElectricalPrice(date)

        const o = {
            toOptimize: !inThePast,

            outsideTemperature: forecast.temperature !== undefined ? forecast.temperature : null,
            outsideWind: forecast.windSpeed !== undefined ? forecast.windSpeed : null ,

            sensiboTemperature: inThePastOrNow ? getSensiboTemperature(date) : null,
            shellyTemperature: inThePastOrNow ? getShellyTemperature(date, i === 0) : null,

            electricalPrice: electricPrice.price,
            electricalPriceEstimated: electricPrice.estimated,

            heaterOn: null,
            waterHeaterOn: null,
            otherHeatersOn: 0,
            cost: null,

            sensiboTemperature2: i === 0 ? getSensiboTemperature(date) : null,
            shellyTemperature2: i === 0 ? getShellyTemperature(date, i === 0) : null,
        }

        // overrider, temp:
        // o.outsideTemperature = 0
        // o.outsideWind = 0

        preparedSimulation[date.toISOString()] = o


        // Finally:
        date = new Date(date.getTime() + 3600 * 1000) // advance an hour
        if (date.getTime() >= toDate.getTime()) break
    }

    // Fill in history:
    const store = getStore()
    for (const action of store.actions) {

        const o = preparedSimulation[action.reason.time]
        if (o) {
            o.heaterOn = action.reason.simulation.heaterOn
            o.waterHeaterOn = action.reason.simulation.waterHeaterOn
        }
    }

    // Fill in some gaps:
    const keys  = Object.keys(preparedSimulation)
    for (let i = 0; i < keys.length; i++) {

        const prev    = preparedSimulation[keys[i-1]]
        const current = preparedSimulation[keys[i]]
        const next    = preparedSimulation[keys[i+1]]

        if (current.outsideTemperature === null) {
            current.outsideTemperature = (
                prev && prev.outsideTemperature !== null
                ? prev.outsideTemperature
                : next && next.outsideTemperature !== null
                ? next.outsideTemperature
                : null
            )
        }

        if (current.outsideWind === null) {
            current.outsideWind = (
                  prev && prev.outsideWind !== null
                ? prev.outsideWind
                : next && next.outsideWind !== null
                ? next.outsideWind
                : null
            )
        }

        if (current.waterHeaterOn === null && !current.toOptimize) {
            current.waterHeaterOn = (
                  prev && prev.waterHeaterOn !== null
                ? prev.waterHeaterOn
                : null
            )
        }
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
function getSensiboTemperature(date) {
    const store = getStore()

    const times = Object.keys(store.sensiboTemperatures.times).map(timeStr => new Date(timeStr).getTime()).sort((a, b) => a-b)

    let mostRecent = undefined
    for (const time of times) {
        if (time <= date.getTime()) {
            mostRecent = store.sensiboTemperatures.times[new Date(time).toISOString()]
        }
    }
    if (mostRecent !== undefined) return mostRecent

    // const exact = store.sensiboTemperatures.times[date.toISOString()]
    // if (exact !== undefined) return exact

    // if (tryToFindLast) {


    //     const lastTimeStr = new Date(times[times.length -1]).toISOString()
    //     return store.sensiboTemperatures.times[lastTimeStr]
    // }
    return null
}
function getShellyTemperature(date, useAnyPrevious ) {
    const store = getStore()

    const times = Object.keys(store.shelly.times).map(timeStr => new Date(timeStr).getTime()).sort((a, b) => a-b)

    let mostRecent = undefined
    for (const time of times) {
        if (
            ( useAnyPrevious && time <= date.getTime() ) ||
            (!useAnyPrevious && time === date.getTime() )
        ) {
            const o = store.shelly.times[new Date(time).toISOString()]
            // if (useAnyPrevious || Math.abs(new Date(o.time).getTime() -   )
            mostRecent = o.temperature
        }
    }
    if (mostRecent !== undefined) return mostRecent

    // const exact = store.shelly.times[date.toISOString()]
    // if (exact) return exact.temperature

    // if (tryToFindLast) {

    //     const lastTimeStr = new Date(times[times.length -1]).toISOString()
    //     return store.shelly.times[lastTimeStr].temperature
    // }
    return null
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
    const firePlaceGainTemp = 10 / houseSize // 0.9 degree / hour

    let first = true
    let prev = null
    let prev2 = null
    let prev3 = null
    let prev4 = null
    for (const dateStr of Object.keys(sim)) {
        const date = new Date(dateStr)
        const o = sim[dateStr]

        // outsideTemperature
        // outsideWind
        // sensiboTemperature
        // electicalPrice
        // heaterOn
        // waterHeaterOn

        o.fireplaceOn = (
            [7,8,9,10,11,15,16,17,18,19,20, 21].includes(date.getHours()) && (!prev || prev.sensiboTemperature < 24)
            ? 1
            : 0
        )


        o.otherHeatersOn = (
            prev && prev.shellyTemperature !== null
            ? Math.min(Math.max((17 - prev.shellyTemperature) / 7, 0), 1)
            : 0
        )

        if (o.sensiboTemperature === null && prev && prev.sensiboTemperature !== null) {


            const firePlaceOnSlow = smartAvg([
                o && o.fireplaceOn,
                prev && prev.fireplaceOn,
                prev2 && prev2.fireplaceOn,
                // prev3 && prev3.fireplaceOn,
                // prev4 && prev4.fireplaceOn,
            ])

            // Downstairs:

            const heaterGain = prev.heaterOn * heaterGainTemp
            const fireplaceGain = firePlaceOnSlow * firePlaceGainTemp

            const heatLoss     = Math.pow(((prev.sensiboTemperature - prev.outsideTemperature) * 0.1), 2) * -0.04
            const heatLossWind = Math.pow(((prev.sensiboTemperature - prev.outsideTemperature) * 0.1), 2) * Math.log(prev.outsideWind + 2) * -0.05

            o.sensiboTemperature = prev.sensiboTemperature + (
                heaterGain +
                fireplaceGain +
                heatLoss +
                heatLossWind
            )
            o.sensiboTemperatureEstimated = true

        }
        if (o.shellyTemperature === null && prev && prev.shellyTemperature !== null) {
            {
                // Upstairs:

                const otherHeaterGain = o.otherHeatersOn * otherHeaterGainTemp

                const heatLoss     = Math.pow(((prev.shellyTemperature - prev.outsideTemperature) * 0.1), 2) * -0.04
                const heatLossWind = Math.pow(((prev.shellyTemperature - prev.outsideTemperature) * 0.1), 2) * Math.log(prev.outsideWind + 2) * -0.03
                const heatTransfer = -(prev.shellyTemperature - prev.sensiboTemperature) * 0.13
                // const heaterGain = o.heaterOn * heaterGainTemp

                o.shellyTemperature = prev.shellyTemperature + (
                    // otherHeaterGain +
                    heatLoss +
                    heatLossWind +
                    heatTransfer
                )
                o.shellyTemperatureEstimated = true

            }
        }

        o.cost = (
            o.heaterOn * heaterPower * electricalCost +
            o.otherHeatersOn * otherHeaterPower * electricalCost +
            o.waterHeaterOn * waterHeaterPower * electricalCost
        )


        // Finally:
        prev4 = prev3
        prev3 = prev2
        prev2 = prev
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
    let sensibo_i = 0
    let shelly_i = 0
    for (const timeStr of Object.keys(sim)){
        const o = sim[timeStr]
        if (o.toOptimize) {
            sum.cost += o.cost
            sum.sensiboTemperatureEnd = o.sensiboTemperature
            if (o.sensiboTemperature) {
                sum.sensiboTemperatureAvg += o.sensiboTemperature
                sensibo_i++
            }
            if(o.sensiboTemperature) sum.sensiboTemperatureLow = Math.min(sum.sensiboTemperatureLow, o.sensiboTemperature)
            if(o.sensiboTemperature) sum.sensiboTemperatureHigh = Math.max(sum.sensiboTemperatureHigh, o.sensiboTemperature)

            sum.shellyTemperatureEnd = o.shellyTemperature
            if (o.shellyTemperature) {
                sum.shellyTemperatureAvg += o.shellyTemperature
                shelly_i++
            }
            if(o.shellyTemperature) sum.shellyTemperatureLow = Math.min(sum.shellyTemperatureLow, o.shellyTemperature)
            if(o.shellyTemperature) sum.shellyTemperatureHigh = Math.max(sum.shellyTemperatureHigh, o.shellyTemperature)
        }


    }
    if (sensibo_i) sum.sensiboTemperatureAvg /= sensibo_i
    if (shelly_i) sum.shellyTemperatureAvg /= shelly_i
    return sum
}
function turnOnHeaterSomeTime(preparation, simulation, conditions) {

    let lowestCost = Number.POSITIVE_INFINITY
    let lowestCostTimeStr = null
    for (const timeStr of Object.keys(preparation)) {
        const o = preparation[timeStr]
        const sim = simulation[timeStr]

        if (
            o.toOptimize &&
            o.heaterOn < 1 &&
            conditions.allowHeaterOn(timeStr, sim)
        ) {
            const factor = (conditions.preferFactor && conditions.preferFactor(timeStr, sim)) || 1
            let cost = o.electricalPrice
            if (cost === null) cost = 9999 + sim.sensiboTemperature
            cost *= factor
            const factor2 = 1 + Math.pow(o.heaterOn, 2) * 0.3
            cost *= factor2
            if (cost < lowestCost) {
                lowestCost = cost
                lowestCostTimeStr = timeStr
            }
        }

    }
    if (lowestCostTimeStr) {
        preparation[lowestCostTimeStr].heaterOn += 0.2

        return true
    } else {
        return false // unable, bail out
    }
}
function turnOnWaterHeater(preparation, startHour, endHour) {

    // To ensure that it runs fairly often, simply pick the cheapest hours every 8 hours:
    let waterHeaterStartHour = new Date(startHour)
    waterHeaterStartHour.setHours(0)
    const waterHeaterHourPeriod = 6
    const waterHeaterOnFactor = 3 / 6
    while (waterHeaterStartHour.getTime() < endHour.getTime()) {
        let costs = []
        for (let i = 0; i< waterHeaterHourPeriod; i++) {
            const date = new Date(waterHeaterStartHour.getTime() + i * 3600 * 1000)
            const o = preparation[date.toISOString()]
            if (o && o.electricalPrice !== null) {
                costs.push({
                    price: o.electricalPrice,
                    timeStr: date.toISOString()
                })
            }
        }
        costs.sort((a, b) => {
            // lowest first
            if (a.price > b.price) return 1
            if (a.price < b.price) return -1
            return 0
        })
        for (const cost of costs) {
            const o = preparation[cost.timeStr]
            if (o.waterHeaterOn === null) {
                o.waterHeaterOn = 0
            }
        }
        costs = costs.slice(0, Math.round(costs.length * waterHeaterOnFactor))
        for (const cost of costs) {
            const o = preparation[cost.timeStr]
            if (o.toOptimize) {
                o.waterHeaterOn = 1
            }
        }

        // Finally:
        waterHeaterStartHour = new Date(waterHeaterStartHour.getTime() + waterHeaterHourPeriod * 3600 * 1000)
    }
}
function smartAvg(values) {
    let i = 0
    let sum = 0
    for (const value of values) {
        if (value !== undefined && value !== null && value !== false) {
            sum += value
            i++
        }
    }
    if (i > 0) {
        return sum / i
    } else return 0
}
