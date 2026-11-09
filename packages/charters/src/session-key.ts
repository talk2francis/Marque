import { hkdfSync } from 'node:crypto'
import { getAddress, type Hex } from 'viem'

/**
 * Keel's per-guard Altana session key (worker only; never imported by the web app).
 *
 *   key = HKDF-SHA256(ikm = master, salt = chainId as 8 bytes big-endian, info = "marque/charters/v1/" + guard)
 *
 * reduced into the secp256k1 scalar range. The key can only call act() on one guard, which anyone may call anyway,
 * so deriving it (rather than storing a secret per guard) keeps nothing per session at rest and lets a restarted
 * worker, or a recovered one, find every key again from the master alone.
 */
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

export function deriveSessionKey(master: Hex, chainId: number, guard: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(master)) throw new Error('the session master must be 32 bytes of hex')
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('bad chain id')
  const salt = Buffer.alloc(8)
  salt.writeBigUInt64BE(BigInt(chainId))
  const info = Buffer.from(`marque/charters/v1/${getAddress(guard).toLowerCase()}`, 'utf8')
  const okm = Buffer.from(hkdfSync('sha256', Buffer.from(master.slice(2), 'hex'), salt, info, 32))
  const k = (BigInt(`0x${okm.toString('hex')}`) % (N - 1n)) + 1n // in [1, n-1], never zero
  return `0x${k.toString(16).padStart(64, '0')}` as Hex
}

/**
 * v2 session keys, one per agent per charter (03_DECISIONS S10):
 *   HKDF-SHA256(master, salt = chainId, info = "marque/charters/v2/" + kind + "/" + charter)
 * The kind is in the info string, so no two charters of any kind share a key, and v1 keys never collide with v2.
 */
export function deriveSessionKeyV2(master: Hex, chainId: number, kind: 'loan' | 'yield' | 'grid' | 'range', charter: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(master)) throw new Error('the session master must be 32 bytes of hex')
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('bad chain id')
  const salt = Buffer.alloc(8)
  salt.writeBigUInt64BE(BigInt(chainId))
  const info = Buffer.from(`marque/charters/v2/${kind}/${getAddress(charter).toLowerCase()}`, 'utf8')
  const okm = Buffer.from(hkdfSync('sha256', Buffer.from(master.slice(2), 'hex'), salt, info, 32))
  const k = (BigInt(`0x${okm.toString('hex')}`) % (N - 1n)) + 1n
  return `0x${k.toString(16).padStart(64, '0')}` as Hex
}
