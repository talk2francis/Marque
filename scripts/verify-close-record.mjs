// Offline check of the original close snapshot. No RPC, account, signature or observation write.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = process.argv[2] ? resolve(process.argv[2]) : resolve(repo, 'docs/evidence/set-and-earn-close-2026-11-05')
const { keccak256, toHex } = createRequire(resolve(repo, 'apps/web/package.json'))('viem')
const manifest = readFileSync(resolve(root, 'SHA256SUMS'))
let files = 0
for (const line of manifest.toString('utf8').trimEnd().split('\n')) {
  const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/)
  assert(match, 'Invalid checksum manifest line')
  const file = match[2]
  assert(!file.startsWith('/') && !file.split('/').includes('..'), 'Invalid snapshot path')
  assert.equal(createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex'), match[1], file)
  files++
}
const receipt = JSON.parse(readFileSync(resolve(repo, 'docs/evidence/close-anchor-2026-11-06.json')))
const digest = keccak256(toHex(manifest))
assert.equal(digest, receipt.checksumFileKeccak256)
console.log(`${files} files match SHA256SUMS. Keccak-256 of its exact bytes: ${digest}`)
console.log(`Recorded BSC testnet anchor: ${receipt.transactionHash}, block ${receipt.blockNumber}. This offline check does not query the chain.`)
