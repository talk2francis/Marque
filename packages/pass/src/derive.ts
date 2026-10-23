import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { bytesToHex, type Hex } from 'viem'

/**
 * Marque Pass key derivation (SPEC-ACCESS 2.2, invariant 35). The wallet key is derived on the
 * device from the passkey's PRF output and exists only for the moment it signs. Marque's servers
 * never see the PRF output, the key or anything derived from it.
 *
 *   SALT_PRF = SHA-256("marque.trade/pass/v1")
 *   key      = HKDF-SHA256(ikm = prf, salt = "marque-pass", info = "bsc-secp256k1-v1", L = 32)
 *   if key == 0 or key >= n: key = HKDF-SHA256(prf, "marque-pass", "bsc-secp256k1-v1#1", 32)
 *
 * WebCrypto (browsers and Node 22) does the hashing, so no key material passes through a library
 * Marque does not already ship.
 */

export const PASS_VERSION = 1
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const enc = new TextEncoder()

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('WebCrypto is not available here')
  return s
}

/** The 32-byte PRF input every Marque Pass asks its passkey for. */
export async function prfSalt(): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest('SHA-256', enc.encode('marque.trade/pass/v1')))
}

async function hkdf32(ikm: Uint8Array, info: string): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', ikm as Uint8Array<ArrayBuffer>, 'HKDF', false, ['deriveBits'])
  const bits = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('marque-pass'), info: enc.encode(info) }, key, 256)
  return new Uint8Array(bits)
}

const toBig = (b: Uint8Array) => BigInt(bytesToHex(b))
const valid = (k: bigint) => k > 0n && k < SECP256K1_N

/** Test seam: `hkdf` can be replaced to exercise the zero-or-overflow branch. */
export async function derivePrivateKey(prf: Uint8Array, hkdf: (ikm: Uint8Array, info: string) => Promise<Uint8Array> = hkdf32): Promise<Hex> {
  if (prf.length !== 32) throw new Error('PRF output must be 32 bytes')
  let k = await hkdf(prf, 'bsc-secp256k1-v1')
  if (!valid(toBig(k))) k = await hkdf(prf, 'bsc-secp256k1-v1#1')
  if (!valid(toBig(k))) throw new Error('derived key out of range twice')
  return bytesToHex(k)
}

/** The account for one confirmation. Callers drop it when the action is signed. */
export async function accountFromPrf(prf: Uint8Array): Promise<PrivateKeyAccount> {
  return privateKeyToAccount(await derivePrivateKey(prf))
}
