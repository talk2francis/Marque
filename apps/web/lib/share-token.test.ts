import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => { process.env['MARQUE_CLAIM_SECRET'] ||= 'test-secret-not-used-in-prod' })

describe('progress share link', () => {
  it('round-trips an address, stably, and rejects anything else', async () => {
    const { sealAddress, unsealAddress } = await import('./share-token')
    const a = '0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452'
    const t = sealAddress(a)!
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.toLowerCase()).not.toContain(a.slice(2).toLowerCase())
    expect(sealAddress(a)).toBe(t)
    expect(unsealAddress(t)).toBe(a.toLowerCase())
    const flipped = t.slice(0, 20) + (t[20] === 'A' ? 'B' : 'A') + t.slice(21)
    expect(unsealAddress(flipped)).toBeNull()
    expect(unsealAddress('not-a-token')).toBeNull()
  })
})
