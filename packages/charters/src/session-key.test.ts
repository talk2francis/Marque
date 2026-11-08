import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { deriveSessionKey } from './session-key'

const master = `0x${'11'.repeat(32)}` as const
const guardA = '0x6B5b4B344fE9A295192dc7B5f544D845601Ae225'
const guardB = '0x6b5b4b344fe9a295192dc7b5f544d845601ae226'

describe('session key derivation', () => {
  it('is deterministic and ignores address case', () => {
    expect(deriveSessionKey(master, 97, guardA)).toBe(deriveSessionKey(master, 97, guardA.toLowerCase()))
  })
  it('differs per guard, per chain and per master', () => {
    const k = deriveSessionKey(master, 97, guardA)
    expect(deriveSessionKey(master, 97, guardB)).not.toBe(k)
    expect(deriveSessionKey(master, 56, guardA)).not.toBe(k)
    expect(deriveSessionKey(`0x${'22'.repeat(32)}`, 97, guardA)).not.toBe(k)
  })
  it('is a valid secp256k1 key', () => {
    const k = deriveSessionKey(master, 97, guardA)
    expect(k).toMatch(/^0x[0-9a-f]{64}$/)
    expect(() => privateKeyToAccount(k)).not.toThrow()
  })
  it('refuses a malformed master or chain', () => {
    expect(() => deriveSessionKey('0x1234', 97, guardA)).toThrow()
    expect(() => deriveSessionKey(master, 0, guardA)).toThrow()
    expect(() => deriveSessionKey(master, 97, 'not-an-address')).toThrow()
  })
})
