const { version } = require('./package.json')
const app = require('./app.json')

module.exports = { ...app.expo, version }
