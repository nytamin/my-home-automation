const { getStore } = require('./dataStore')
const { getPrice } = require('./settings')

exports.updateElecticalPrice = async function () {

    const store = getStore()
    if (!store.electricalPrices) store.electricalPrices = {times: {}}
    const lastUpdated = store.electricalPrices.lastUpdated ? new Date(store.electricalPrices.lastUpdated) : null

    const latestPrice = last(Object.keys(store.electricalPrices.times).sort((a,b) => a-b))
    const nextMidnight = new Date()
    nextMidnight.setHours(24)
    nextMidnight.setMinutes(0)
    nextMidnight.setSeconds(0)
    nextMidnight.setMilliseconds(0)

    if (
        (
            true ||
            !lastUpdated ||
            Math.abs(Date.now() - lastUpdated.getTime()) > 5.8 * 3600 * 1000 // At least 6 hours has passed since last
        ) &&
        (
            !latestPrice ||
            (
                new Date().getHours() > 13 &&
                new Date(latestPrice).getTime() < (nextMidnight.getTime() + 3 * 3600 * 1000)
            )
        )
    ) {

        console.log('Updating Electrical prices')

        const newEntries = await getPrice()
        newEntries.forEach(entry => {
            store.electricalPrices.times[entry.date.toISOString()] = entry.price
        })
        store.electricalPrices.lastUpdated = Date.now()
    }



}
function last (values) {
    return values[values.length - 1]
}
