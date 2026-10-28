const BlindPairing = require('blind-pairing')
const z32 = require('z32')
const { Fault } = require('../shared/protocol')

function validateInvite(value) {
  try {
    if (
      typeof value !== 'string' ||
      value.length > 512 ||
      !/^[ybndrfg8ejkmcpqxot1uwisza345h769]+$/.test(value)
    ) {
      throw new Error('format')
    }
    const bytes = z32.decode(value)
    const invite = BlindPairing.decodeInvite(bytes)
    if (
      z32.encode(bytes) !== value ||
      !invite.discoveryKey ||
      invite.testInvitation ||
      (invite.expires && invite.expires <= Date.now())
    ) {
      throw new Error('invalid')
    }
    return value
  } catch {
    throw new Fault('INVALID_INVITE', 'Invitation is invalid or expired. Ask for a new invitation.')
  }
}

module.exports = { validateInvite }
