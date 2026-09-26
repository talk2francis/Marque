#!/usr/bin/env node
/**
 * Create a reference agent's wallet: a fresh key, a random keystore password in
 * agents/<id>/.studio/.env.local (0600, gitignored), and a Keystore V3 file
 * written by the Studio SDK itself so the agent runtime reads it unchanged.
 * Prints the address only. Refuses if the agent already has a keystore.
 *
 *   node scripts/new-agent-wallet.mjs tidemark
 *   node scripts/new-agent-wallet.mjs keeper --out /root/.marque/keeper   (a wallet outside the repo)
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { EVMWalletProvider } from '@bnbagent/sdk'

const id = process.argv[2]
if (!id || !/^[a-z][a-z0-9-]{1,30}$/.test(id)) throw new Error('usage: new-agent-wallet.mjs <agent-id>')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const outIx = process.argv.indexOf('--out')
const studio = outIx > -1 ? process.argv[outIx + 1] : join(ROOT, 'agents', id, '.studio')
const wallets = join(studio, 'wallets')
if (existsSync(wallets) && readdirSync(wallets).some((f) => f.endsWith('.json'))) throw new Error(`agents/${id} already has a keystore`)
mkdirSync(wallets, { recursive: true })

const password = randomBytes(24).toString('hex')
const pk = generatePrivateKey()
writeFileSync(join(studio, '.env.local'), `WALLET_PASSWORD=${password}\n`, { mode: 0o600 })
new EVMWalletProvider({ password, privateKey: pk, persist: true, walletsDir: wallets })
const files = readdirSync(wallets).filter((f) => f.endsWith('.json'))
if (!files.length) throw new Error('the SDK wrote no keystore')
console.log(privateKeyToAccount(pk).address)
