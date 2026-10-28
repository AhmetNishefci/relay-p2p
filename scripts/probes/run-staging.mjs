// Host driver: requires a running debug app and Metro at localhost:8081.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { connect } from './inspector.mjs'
import crypto from 'hypercore-crypto'
const require = createRequire(import.meta.url)
const bundle = require('../../.assessment-local/phase11a/staging.bundle.js')
const targets = await (await fetch('http://localhost:8081/json/list')).json()
assert.ok(targets.length)
const target = targets[0]
const p = await connect(target)
try {
  const url =
    'http://localhost:8081/scripts/probes/staging-rn.bundle?platform=android&dev=true&minify=false&modulesOnly=true&runModule=true'
  const response = await fetch(url)
  assert.equal(response.status, 200)
  const ascii = (text) =>
    text.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  await p.evaluate(ascii(await response.text()))
  const cases = [0, 37, 1048576, 1048577].map((size) => {
    const bytes = Buffer.alloc(size)
    for (let i = 0; i < size; i++) bytes[i] = i % 251
    return { size, digest: crypto.hash(bytes).toString('hex') }
  })
  await p.evaluate(
    `globalThis.__stagingResult=null;globalThis.__relayStagingProof(${ascii(JSON.stringify(bundle))},${JSON.stringify(cases)}).then(result=>{globalThis.__stagingResult={result}},error=>{globalThis.__stagingResult={error:String(error),stack:error.stack}});true`
  )
  const until = Date.now() + 60000
  let result
  while (Date.now() < until) {
    result = JSON.parse(await p.evaluate('JSON.stringify(globalThis.__stagingResult)'))
    if (result) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  console.log(JSON.stringify({ target: target.id, ...result }, null, 2))
  assert.ok(result?.result?.passed)
} finally {
  p.close()
}
