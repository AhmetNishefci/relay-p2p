const test = require('node:test')
const assert = require('node:assert/strict')
const { selectionOf, fileSize, fileType } = require('../src/attachment-selection')

test('document selection validates supported types, filenames, local URIs and exact size boundaries', () => {
  const asset = {
    uri: 'content://documents/one',
    name: 'observation.txt',
    mimeType: 'text/plain',
    size: 1048576
  }
  assert.deepEqual(selectionOf(asset), {
    uri: asset.uri,
    filename: asset.name,
    mimeType: asset.mimeType,
    size: asset.size
  })
  for (const [name, mime] of [
    ['photo.JPG', 'image/jpeg'],
    ['diagram.png', 'image/png'],
    ['report.pdf', 'application/pdf'],
    ['notes.txt', 'text/plain']
  ]) {
    assert.equal(
      selectionOf({ ...asset, name, mimeType: 'application/octet-stream' }).mimeType,
      mime
    )
  }
  assert.equal(
    selectionOf({ ...asset, name: 'photo.jpg', mimeType: 'image/jpg' }).mimeType,
    'image/jpeg'
  )
  assert.equal(selectionOf({ ...asset, size: 0 }).size, 0)
  for (const invalid of [
    null,
    {},
    { ...asset, uri: 'https://example.com/x' },
    { ...asset, size: undefined },
    { ...asset, size: 1048577 },
    { ...asset, size: -1 },
    { ...asset, name: '../secret.txt' },
    { ...asset, name: 5 },
    { ...asset, mimeType: 5 },
    { ...asset, mimeType: 'application/x-executable' },
    { ...asset, name: 'unknown.bin', mimeType: undefined }
  ]) {
    assert.throws(() => selectionOf(invalid))
  }
})
test('attachment labels distinguish actual byte sizes and supported formats', () => {
  assert.equal(fileSize(0), '0 B')
  assert.equal(fileSize(1024), '1 KiB')
  assert.equal(fileSize(1048576), '1 MiB')
  assert.equal(fileType('application/pdf'), 'PDF document')
})
