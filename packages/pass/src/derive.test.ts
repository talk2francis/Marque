import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { derivePrivateKey, accountFromPrf, prfSalt } from './derive.js'
import { createPassProvider } from './provider.js'

const prfA = Uint8Array.from({ length: 32 }, (_, i) => i)
const prfB = Uint8Array.from({ length: 32 }, (_, i) => 255 - i)

describe('Marque Pass derivation (SPEC-ACCESS 2.2)', () => {
  it('the PRF salt is SHA-256("marque.trade/pass/v1")', async () => {
    expect(Buffer.from(await prfSalt()).toString('hex')).toBe(createHash('sha256').update('marque.trade/pass/v1').digest('hex'))
    expect((await prfSalt()).length).toBe(32)
  })
  it('a fixed PRF output gives a fixed key and address, on every run', async () => {
    const k1 = await derivePrivateKey(prfA)
    const k2 = await derivePrivateKey(prfA)
    expect(k1).toBe(k2)
    expect(k1).toMatch(/^0x[0-9a-f]{64}$/)
    expect((await accountFromPrf(prfA)).address).toBe(privateKeyToAccount(k1).address)
    expect((await accountFromPrf(prfA)).address).toMatchInlineSnapshot(`"0x69E162D6aD532f702e06463233BC035181F044a7"`)
  })
  it('different PRF outputs give different keys', async () => {
    expect(await derivePrivateKey(prfA)).not.toBe(await derivePrivateKey(prfB))
  })
  it('the two HKDF info strings give different keys', async () => {
    const seen: string[] = []
    const real = async (ikm: Uint8Array, info: string) => {
      const s = globalThis.crypto.subtle
      const key = await s.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
      seen.push(info)
      return new Uint8Array(await s.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('marque-pass'), info: new TextEncoder().encode(info) }, key, 256))
    }
    const a = await real(prfA, 'bsc-secp256k1-v1'), b = await real(prfA, 'bsc-secp256k1-v1#1')
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'))
    expect(seen).toEqual(['bsc-secp256k1-v1', 'bsc-secp256k1-v1#1'])
  })
  it('the zero-or-overflow branch falls back to the #1 info string', async () => {
    const n = Uint8Array.from(Buffer.from('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 'hex'))
    const fallback = Uint8Array.from({ length: 32 }, () => 7)
    const calls: string[] = []
    const key = await derivePrivateKey(prfA, async (_ikm, info) => { calls.push(info); return info.endsWith('#1') ? fallback : n })
    expect(calls).toEqual(['bsc-secp256k1-v1', 'bsc-secp256k1-v1#1'])
    expect(key).toBe(`0x${'07'.repeat(32)}`)
    await expect(derivePrivateKey(prfA, async () => new Uint8Array(32))).rejects.toThrow(/out of range/)
  })
  it('refuses a PRF output that is not 32 bytes', async () => {
    await expect(derivePrivateKey(new Uint8Array(16))).rejects.toThrow(/32 bytes/)
  })
})

describe('Marque Pass provider (no network)', () => {
  const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
  const make = (mainnetEnabled = false) => createPassProvider({ address: () => account.address, confirm: async () => account, mainnetEnabled })
  it('answers accounts and chain without a prompt, and starts on testnet', async () => {
    const p = make()
    expect(await p.request({ method: 'eth_accounts' })).toEqual([account.address])
    expect(await p.request({ method: 'eth_chainId' })).toBe('0x61')
  })
  it('refuses mainnet until it is enabled (G-P1), and anything but BSC', async () => {
    await expect(make().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] })).rejects.toMatchObject({ code: 4902 })
    await expect(make(true).request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] })).rejects.toMatchObject({ code: 4902 })
    const p = make(true)
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] })
    expect(await p.request({ method: 'eth_chainId' })).toBe('0x38')
  })
  it('signs a message only through the confirmation, with the confirmed account', async () => {
    let asked: unknown = null
    const p = createPassProvider({ address: () => account.address, confirm: async (r) => { asked = r; return account } })
    const sig = await p.request({ method: 'personal_sign', params: ['0x68656c6c6f', account.address] })
    expect(asked).toMatchObject({ kind: 'message', message: 'hello' })
    expect(sig).toBe(await account.signMessage({ message: 'hello' }))
  })
  it('a cancelled confirmation signs nothing', async () => {
    const p = createPassProvider({ address: () => account.address, confirm: async () => { throw Object.assign(new Error('Cancelled'), { code: 4001 }) } })
    await expect(p.request({ method: 'personal_sign', params: ['0x68656c6c6f', account.address] })).rejects.toThrow('Cancelled')
  })
  it('a locked Pass exposes no account and refuses to sign', async () => {
    const p = createPassProvider({ address: () => null, confirm: async () => account })
    expect(await p.request({ method: 'eth_accounts' })).toEqual([])
    await expect(p.request({ method: 'personal_sign', params: ['0x00', account.address] })).rejects.toMatchObject({ code: 4100 })
  })
})
