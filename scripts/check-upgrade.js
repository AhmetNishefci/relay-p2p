const link = require('pear-link')
const pkg = require('../package.json')

const { upgrade } = pkg

if (!upgrade) invalid('package.json#upgrade is not set')

let parsed = null
try {
  parsed = link.parse(upgrade)
} catch (err) {
  invalid(`package.json#upgrade is not a valid link: ${upgrade} (${err.message})`)
}

if (parsed.protocol !== 'pear:' || parsed.drive.key === null) {
  invalid(`package.json#upgrade is not a pear:// drive link: ${upgrade}`)
}

function invalid(reason) {
  console.error(reason)
  console.error('Use `pear touch` to get a valid upgrade key for package.json#upgrade')
  process.exit(1)
}
