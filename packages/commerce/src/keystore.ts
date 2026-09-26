import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { scryptSync, createDecipheriv } from 'node:crypto'
import { keccak256, bytesToHex, type Hex } from 'viem'

/**
 * Unlock a Keystore V3 (scrypt + aes-128-ctr) written by the Studio SDK, from a
 * directory holding `.env.local` (WALLET_PASSWORD) and `wallets/<address>.json`.
 * Used by the keeper; the key stays in memory and is never logged.
 */
export function loadKeystore(dir: string): Hex {
  const env = readFileSync(join(dir, '.env.local'), 'utf8')
  const password = env.match(/^WALLET_PASSWORD=(.+)$/m)?.[1]?.trim()
  if (!password) throw new Error(`no WALLET_PASSWORD in ${dir}/.env.local`)
  const file = readdirSync(join(dir, 'wallets')).find((f) => f.endsWith('.json'))
  if (!file) throw new Error(`no keystore in ${dir}/wallets`)
  const ks = JSON.parse(readFileSync(join(dir, 'wallets', file), 'utf8')) as { crypto?: Record<string, any>; Crypto?: Record<string, any> }
  const c = (ks.crypto ?? ks.Crypto)!
  if (c['kdf'] !== 'scrypt') throw new Error(`unsupported kdf ${c['kdf']}`)
  const kp = c['kdfparams']
  const dk = scryptSync(Buffer.from(password, 'utf8'), Buffer.from(kp.salt, 'hex'), kp.dklen, { N: kp.n, r: kp.r, p: kp.p, maxmem: 512 * 1024 * 1024 })
  const ct = Buffer.from(c['ciphertext'], 'hex')
  if (keccak256(Buffer.concat([dk.subarray(16, 32), ct])).slice(2) !== String(c['mac']).toLowerCase()) throw new Error('keystore MAC mismatch')
  const d = createDecipheriv('aes-128-ctr', dk.subarray(0, 16), Buffer.from(c['cipherparams'].iv, 'hex'))
  return bytesToHex(Buffer.concat([d.update(ct), d.final()]))
}
