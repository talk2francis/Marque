/**
 * Regenerate the five reference-agent wallets and keystores (REC-02 / P10.5C).
 *
 * The originals were lost when the VPS was wiped. Each agent is `evm-local`
 * (kind in studio.toml): it needs a Web3 v3 keystore file named
 * `<checksumAddress>.json` in `.studio/wallets/`, unlocked by WALLET_PASSWORD
 * from `.studio/.env.local`. This mints fresh throwaway testnet keys, encrypts
 * them to v3 keystores with Node crypto + @noble scrypt/keccak (no `bag` CLI,
 * no `ethers`), and writes the studio.toml `[wallet].address` anchor.
 *
 * TESTNET ONLY. New ERC-8004 token ids on re-registration.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes, createCipheriv, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { scrypt } from '@noble/hashes/scrypt'
import { keccak_256 } from '@noble/hashes/sha3'

const AGENTS = ['bound', 'lattice', 'sluicegate', 'keel', 'redcell']
const ROOT = new URL('..', import.meta.url).pathname
const N = 131072, r = 8, p = 1, dklen = 32

function encryptKeystore(pkHex, password) {
  const priv = Buffer.from(pkHex.replace(/^0x/, ''), 'hex')
  const salt = randomBytes(32)
  const iv = randomBytes(16)
  const dk = scrypt(Buffer.from(password, 'utf8'), salt, { N, r, p, dkLen: dklen })
  const encKey = Buffer.from(dk.slice(0, 16))
  const cipher = createCipheriv('aes-128-ctr', encKey, iv)
  const ciphertext = Buffer.concat([cipher.update(priv), cipher.final()])
  const mac = Buffer.from(keccak_256(Buffer.concat([Buffer.from(dk.slice(16, 32)), ciphertext])))
  const address = privateKeyToAccount(pkHex).address
  return {
    address,
    json: {
      version: 3,
      id: randomUUID(),
      address: address.slice(2).toLowerCase(),
      crypto: {
        ciphertext: ciphertext.toString('hex'),
        cipherparams: { iv: iv.toString('hex') },
        cipher: 'aes-128-ctr',
        kdf: 'scrypt',
        kdfparams: { dklen, salt: salt.toString('hex'), n: N, r, p },
        mac: mac.toString('hex'),
      },
    },
  }
}

const out = []
for (const name of AGENTS) {
  const pk = generatePrivateKey()
  const password = randomBytes(24).toString('base64url')
  const { address, json } = encryptKeystore(pk, password)

  const walletsDir = join(ROOT, 'agents', name, '.studio', 'wallets')
  mkdirSync(walletsDir, { recursive: true })
  writeFileSync(join(walletsDir, `${address}.json`), JSON.stringify(json), { mode: 0o600 })
  writeFileSync(
    join(ROOT, 'agents', name, '.studio', '.env.local'),
    `WALLET_PASSWORD=${password}\n`,
    { mode: 0o600 },
  )
  out.push({ name, address, password })
  console.log(`${name.padEnd(11)} ${address}`)
}

console.log('\n--- studio.toml [wallet].address lines to set ---')
for (const a of out) console.log(`${a.name}: address = "${a.address}"`)
console.log('\n--- passwords (also written to each .studio/.env.local) ---')
for (const a of out) console.log(`${a.name.toUpperCase()}_WALLET_PASSWORD=${a.password}`)
