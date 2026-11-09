#!/usr/bin/env node
// Creates an operational key for Charters on this server, encrypted, and prints only its public address.
//   node scripts/charters-keystore.mjs <dir>      e.g. /root/.marque/charters/keel-watcher
// Layout matches what loadKeystore() in @marque/commerce reads: <dir>/.env.local (WALLET_PASSWORD) and
// <dir>/wallets/<name>.json (Web3 v3 keystore, scrypt, aes-128-ctr). Refuses to overwrite an existing key.
import { createCipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const dir = process.argv[2]
if (!dir || !dir.startsWith('/root/.marque/')) {
  console.error('usage: node scripts/charters-keystore.mjs /root/.marque/<path>')
  process.exit(64)
}
if (existsSync(join(dir, 'wallets')) || existsSync(join(dir, '.env.local'))) {
  console.error(`${dir} already holds a key; refusing to overwrite it`)
  process.exit(1)
}
mkdirSync(join(dir, 'wallets'), { recursive: true, mode: 0o700 })

const key = randomBytes(32)
const password = randomBytes(32).toString('base64url')
const account = privateKeyToAccount(toHex(key))
const salt = randomBytes(32), iv = randomBytes(16)
const kdfparams = { dklen: 32, n: 262144, r: 8, p: 1, salt: salt.toString('hex') }
const dk = scryptSync(Buffer.from(password, 'utf8'), salt, 32, { N: kdfparams.n, r: 8, p: 1, maxmem: 512 * 1024 * 1024 })
const cipher = createCipheriv('aes-128-ctr', dk.subarray(0, 16), iv)
const ciphertext = Buffer.concat([cipher.update(key), cipher.final()])
const mac = keccak256(Buffer.concat([dk.subarray(16, 32), ciphertext])).slice(2)
const keystore = {
  version: 3, id: randomUUID(), address: account.address.slice(2).toLowerCase(),
  crypto: { cipher: 'aes-128-ctr', cipherparams: { iv: iv.toString('hex') }, ciphertext: ciphertext.toString('hex'), kdf: 'scrypt', kdfparams, mac },
}
writeFileSync(join(dir, 'wallets', `${basename(dir)}.json`), JSON.stringify(keystore), { mode: 0o600 })
writeFileSync(join(dir, '.env.local'), `WALLET_PASSWORD=${password}\n`, { mode: 0o600 })
key.fill(0)
console.log(account.address)
