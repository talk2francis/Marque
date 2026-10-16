import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { network } from '@marque/commerce'
const { readContract } = vi.hoisted(() => ({ readContract: vi.fn() }))
vi.mock('@marque/commerce', async original => ({ ...await original<object>(), chainClient: () => ({ readContract }) }))
const owner = privateKeyToAccount(`0x${'1'.repeat(64)}`)
const registry = network(56).identityRegistry
const key = `56:${registry.toLowerCase()}:1`
beforeEach(() => readContract.mockReset().mockResolvedValue(owner.address))

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
      k: 'claim', agentId: key, owner: owner.address,
      tokenId: '1', contract: registry,
      nonce: 'n', message: 'm', signature: `0x${'1'.repeat(130)}`, iat: Date.now(),
    })
    expect(readClaimToken(good)).toMatchObject({ agentId: key, tokenId: '1' })
  })
})

describe('canonical claim authority', () => {
  async function proof() {
    const c = await import('./claim')
    const nonce = c.issueNonce('1', registry, owner.address, 56)
    const message = c.buildClaimMessage({ tokenId: '1', contract: registry, owner: owner.address, chainId: 56, nonce: nonce.nonce, issuedAt: nonce.issuedAt })
    const signature = await owner.signMessage({ message })
    return { c, args: { nonceToken: nonce.token, message, signature, agentId: key } }
  }
  it('verifies only the canonical identity, exact message and current owner', async () => {
    const { c, args } = await proof()
    const good = await c.verifyClaim(args)
    expect(good).toMatchObject({ ok: true, agentId: key })
    if (!good.ok) throw new Error('verification failed')
    expect(c.readClaimToken(good.claimToken)).toMatchObject({ agentId: key, chainId: 56, tokenId: '1' })
    expect(await c.verifyClaim({ ...args, agentId: key.slice(0, -1) + '999' })).toMatchObject({ ok: false })
    expect(await c.verifyClaim({ ...args, message: args.message + '\nChain ID: 97' })).toMatchObject({ ok: false })
    readContract.mockResolvedValue('0x2222222222222222222222222222222222222222')
    expect(await c.verifyClaim(args)).toMatchObject({ ok: false })
    expect(await c.claimOwnerIsCurrent(c.readClaimToken(good.claimToken)!)).toBe(false)
  })
  it('rejects future/malformed claim tokens and mismatched registry/network/token tuples', async () => {
    const { c } = await proof()
    const data = { k: 'claim', agentId: key, owner: owner.address, tokenId: '1', contract: registry, chainId: 56, nonce: 'n', message: 'm', signature: `0x${'1'.repeat(130)}`, iat: Date.now() }
    for (const changes of [{ agentId: key + '0' }, { chainId: 97 }, { contract: owner.address }, { tokenId: '-1' }, { iat: Date.now() + 60_000 }, { iat: 'NaN' }]) expect(c.readClaimToken(c.__testonly.sign({ ...data, ...changes }))).toBeNull()
    expect(c.__testonly.verify(c.__testonly.sign(data) + '.extra')).toBeNull()
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
