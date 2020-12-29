const fetch = require('node-fetch')
const { getStore } = require('./dataStore')
const { easee } = require('./settings')

exports.updateEaseeStatus = async function () {

    const token = await getToken()

    console.log(token)


    const chargers = await getChargers(token)
    const charger = chargers[0]
    if (!charger) throw new Error('No chargers found!')

    // console.log('charger', charger)
    const details = await getChargerDetails(token, charger.id)


    // console.log('reply', reply)
    // console.log('details', details)
}

async function getChargers (token) {
    // return await await (await fetch(`https://api.easee.cloud/api/accounts/chargers`, {
    return await await (await fetch(`https://api.easee.cloud/api/chargers`, {
        method: 'get',
        headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'accept': 'application/json'
        },
    })).json()
}
async function getChargerDetails (token, id) {
    return await await (await fetch(`https://api.easee.cloud/api/chargers/${id}/state`, {
        method: 'get',
        headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'accept': 'application/json'
        },
    })).json()
}

async function getToken () {

    const store = getStore()
    if (!store.easee) store.easee = {}

    if (store.easee.token) {
        if (store.easee.token.expires > Date.now()) {
            return store.easee.token.token
        }
    }

    const reply = await (await fetch(`https://api.easee.cloud/api/accounts/token`, {
        method: 'post',
        headers: {
            'Content-Type': 'application/json',
            'accept': 'application/json'
        },
        //  -H  "Content-Type: application/json-patch+json"
        body:    JSON.stringify({
            userName: easee.username,
            password: easee.password
        })
    })).json()

    console.log('reply', reply)

    store.easee.token = {
        expires: Date.now() + reply.expiresIn * 1000,
        token: reply
    }

    return reply
}
