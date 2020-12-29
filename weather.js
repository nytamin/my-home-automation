const { location } = require('./settings')
const fetch = require('node-fetch')
var xmlJs = require('xml-js')
const { getStore } = require('./dataStore')

// API: https://api.met.no/weatherapi/locationforecast/2.0/documentation


exports.updateWeather = async function () {
    const store = getStore()
    if (!store.weather) store.weather = {forecasts: {}}
    if (Date.now() - (store.weather.lastUpdated || 0) > 6 * 3600 * 1000) { // 6 hours

        console.log('Updating Weather forecast')

        const forecasts = await getWeather()
        store.weather.lastUpdated = Date.now()
        for (const key of Object.keys(forecasts)) {
            store.weather.forecasts[key] = forecasts[key]
        }
        // remove old:
        for (const timeStr of Object.keys(store.weather.forecasts)) {
            if (Date.now() - new Date(timeStr).getTime() > 24 * 3600 * 1000 ) {
                delete store.weather.forecasts[timeStr]
            }
        }
    }
}
async function getWeather () {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/classic?lat=${location.lat}&lon=${location.lon}`


    const xmlText = await (await fetch(url)).text()

    const xmlRoot = xmlJs.xml2js(xmlText, {compact: false});

    const weatherPoints = []

    xmlRoot.elements.forEach(el => {
        if (el.name === 'weatherdata') {
            const weatherdata = el
            weatherdata.elements.forEach(el => {
                if (el.name === 'product' && el.attributes.class === 'pointData') {
                    const pointData = el
                    pointData.elements.forEach(el => {
                        if (el.name === 'time') {
                            const time = el

                            const point = {}
                            weatherPoints.push(point)
                            point.from = new Date(time.attributes.from)
                            point.to = new Date(time.attributes.to)

                            time.elements.forEach(el => {
                                if (el.name === 'location') {
                                    const location = el
                                    location.elements.forEach(el => {
                                        if (el.attributes.value) {
                                            point[el.name] = parse(el.attributes.value)
                                        } else if (el.attributes.mps) { // wind
                                            point[el.name] = parse(el.attributes.mps)
                                        }
                                    })

                                } else console.log('time.el: '+el.name)
                            })
                        }
                    })

                }
            })
        }
    })
    const times = []

    const hourlyForecasts = {}
    weatherPoints.forEach(point => {
        const timeStr = point.from.toISOString()

        const time = point.from.getTime()

        if (Math.abs(Date.now() - time) > 48 * 3600 * 1000) return // limit to 48 hours ahead
        times.push(time)

        let hourlyForecast = hourlyForecasts[timeStr]
        if (!hourlyForecast) {
            hourlyForecast = {}
            hourlyForecasts[timeStr] = hourlyForecast
        }

        for (let key of Object.keys(point)) {
            if (![
                'from',
                'to',
                'precipitation',
                'dewpointTemperature',
                'windProbability',
                'temperatureProbability',
                'pressure',
                'humidity',
                'symbolProbability',
                'minTemperature',
                'maxTemperature',
            ].includes(key)) {
                hourlyForecast[key] = point[key]
            }
        }
    })


    times.sort((a, b) => {
        return a-b
    })


    const forecasts = {}
    let prevForecast = {}
    for (let time of times) {
        const timeStr = new Date(time).toISOString()

        const currentForecast = {}
        for (const key of Object.keys(prevForecast)) {
            currentForecast[key] = prevForecast[key]
        }
        const hourlyForecast = hourlyForecasts[timeStr]

        for (const key of Object.keys(hourlyForecast)) {
            currentForecast[key] = hourlyForecast[key]
        }

        forecasts[timeStr] = currentForecast
    }

    return forecasts
}
function parse (str) {
    str = str + ''
    if (str.match(/^[0-9.-]*$/)) {
        return parseFloat(str)
    }
    return str
}
