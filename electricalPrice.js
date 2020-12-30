const { getStore } = require('./dataStore')
const { getPrice } = require('./settings')

exports.updateElecticalPrice = async function () {

    const store = getStore()
    if (!store.electricalPrices) store.electricalPrices = {times: {}}
    const lastUpdated = store.electricalPrices.lastUpdated ? new Date(store.electricalPrices.lastUpdated) : null
    if (
        !lastUpdated ||
        lastUpdated.getDate() !== new Date().getDate() ||  // Do a new check every midnight
        Math.abs(Date.now() - lastUpdated.getTime()) > 6 * 3600 * 1000 // every 6 hours
    ) {

        console.log('Updating Electrical prices')

        const newEntries = await getPrice()
        newEntries.forEach(entry => {
            store.electricalPrices.times[entry.date.toISOString()] = entry.price
        })
        store.electricalPrices.lastUpdated = Date.now()
    }



}
