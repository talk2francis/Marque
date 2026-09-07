import { describe, it, expect, beforeAll } from 'vitest'

/**
 * The claim rail's proof primitives (P10a).
 *
 * The full verify path reads `ownerOf` from chain and is exercised live; these
 * cover the parts that decide whether a forged or stale token is accepted,
 * which are pure and must never regress.
 */

beforeAll(() => { process.env['MARQUE_CLAIM_SECRET'] ||= 'test-secret-not-used-in-prod' })

describe('claim tokens', () => {
  it('round-trips a signed payload and rejects tampering', async () => {
    const { __testonly } = await import('./claim.js')
    const token = __testonly.sign({ k: 'claim', agentId: '56:0xabc:1', iat: Date.now() })
    expect(__testonly.verify(token)).toMatchObject({ k: 'claim', agentId: '56:0xabc:1' })

    // Flip one character of the body — the HMAC must no longer match.
    const [body = '', mac = ''] = token.split('.')
    const flipped = `${body.slice(0, -1)}${body.slice(-1) === 'A' ? 'B' : 'A'}.${mac}`
    expect(__testonly.verify(flipped)).toBeNull()

    // Swap the signature — rejected.
    expect(__testonly.verify(`${body}.${mac.slice(0, -1)}X`)).toBeNull()
    expect(__testonly.verify('not-a-token')).toBeNull()
  })

  it('readClaimToken enforces the kind and the TTL', async () => {
    const { __testonly, readClaimToken } = await import('./claim.js')
    // A nonce token is not a claim token.
    const nonceish = __testonly.sign({ k: 'nonce', nonce: 'x', iat: Date.now() })
    expect(readClaimToken(nonceish)).toBeNull()

    // An expired claim token.
    const stale = __testonly.sign({
      k: 'claim', agentId: '56:0xabc:1', owner: '0x1111111111111111111111111111111111111111',
      tokenId: '1', contract: '0x2222222222222222222222222222222222222222', iat: Date.now() - 60 * 60_000,
    })
    expect(readClaimToken(stale)).toBeNull()

    // A fresh, well-formed one.
    const good = __testonly.sign({
      k: 'claim', agentId: '56:0xabc:1', owner: '0x1111111111111111111111111111111111111111',
      tokenId: '1', contract: '0x2222222222222222222222222222222222222222',
      nonce: 'n', message: 'm', signature: '0xsig', iat: Date.now(),
    })
    expect(readClaimToken(good)).toMatchObject({ agentId: '56:0xabc:1', tokenId: '1' })
  })
})

describe('buildClaimMessage', () => {
  it('names the identity, the nonce and states it authorises nothing', async () => {
    const { buildClaimMessage } = await import('./claim.js')
    const msg = buildClaimMessage({
      tokenId: '338589',
      contract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      owner: '0x5Ee5D643Df0c0033f328A50a580B59Fb31c105C6',
      nonce: 'abc123',
      issuedAt: '2026-09-07T00:00:00.000Z',
    })
    expect(msg).toContain('Identity: #338589')
    expect(msg).toContain('Nonce: abc123')
    expect(msg).toContain('Chain ID: 56')
    expect(msg).toMatch(/authorises no transaction/i)
  })
})
