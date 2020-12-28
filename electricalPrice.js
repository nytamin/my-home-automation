const { getStore } = require('./dataStore')
const { getPrice } = require('./settings')

exports.updateElecticalPrice = async function () {

    const store = getStore()
    if (!store.electricalPrices) store.electricalPrices = {times: {}}
    if (Date.now() - (store.electricalPrices.lastUpdated || 0) > 6 * 3600 * 1000) { // 6 hours

        console.log('Updating electrical prices')

        const newEntries = await getPrice()
        store.electricalPrices.lastUpdated = Date.now()
        newEntries.forEach(entry => {
            store.electricalPrices.times[entry.date.toISOString()] = entry.price
        })
    }



}
