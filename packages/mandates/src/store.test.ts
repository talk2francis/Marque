import { describe, expect, it } from 'vitest'
import { InMemoryCharterStore, serialiseGrant, deserialiseGrant } from './store.js'
import { toSmallestUnit, type Charter, type CharterGrant } from './types.js'

/**
 * The storage boundary is where a spend cap becomes a lie.
 *
 * An 18-decimal cap exceeds 2^53, so a limit that crosses JSON as a number is
 * silently rounded and the charter that comes back is not the charter that was
 * granted. These tests exist because that failure is invisible: nothing throws,
 * nothing logs, and the first symptom is an agent that cannot execute — or, far
 * worse, one that can execute more than it was allowed.
 */

const grant = (over: Partial<CharterGrant> = {}): CharterGrant => ({
  owner: '0xD09B8D9e266b87759E505287ef07633ECAE55eD3',
  agentId: 'marque:keel',
  chainId: 97,
  expiresAt: 1_800_000_000,
  calls: [{ to: '0xb7526572FFE56AB9D7489838Bf2E18e3323b441A', selectors: ['0x0e752702'], label: 'Venus vUSDT market' }],
  spend: [{ limit: toSmallestUnit(100, 18), period: 'total', decimals: 18, symbol: 'USDT' }],
  ...over,
})

describe('grant serialisation', () => {
  it('round-trips an 18-decimal cap without losing a single unit', () => {
    const g = grant()
    const back = deserialiseGrant(serialiseGrant(g))
    expect(back.spend[0]!.limit).toBe(g.spend[0]!.limit)
    expect(back.spend[0]!.limit).toBe(100_000_000_000_000_000_000n)
  })

  it('stores limits as decimal strings, never as JSON numbers', () => {
    const raw = serialiseGrant(grant()) as { spend: Array<{ limit: unknown }> }
    expect(typeof raw.spend[0]!.limit).toBe('string')
    expect(raw.spend[0]!.limit).toBe('100000000000000000000')
  })

  it('survives a cap that JSON.parse would round away', () => {
    // 2^53 + 1 in smallest units: representable as a bigint, not as a double.
    const limit = 9_007_199_254_740_993n
    const back = deserialiseGrant(serialiseGrant(grant({
      spend: [{ limit, period: 'day', decimals: 18, symbol: 'tBNB' }],
    })))
    expect(back.spend[0]!.limit).toBe(limit)
    // The point of the string round trip: passing this value through a double
    // loses the odd unit. The bigint path does not.
    expect(BigInt(Number(limit))).not.toBe(limit)
    expect(BigInt(Number(limit))).toBe(9_007_199_254_740_992n)
  })

  it('keeps an empty selector list distinct from an absent one', () => {
    // Empty means EVERY function on that contract, which is a wider grant. The
    // UI has to be able to tell the two apart to say so.
    const wide = deserialiseGrant(serialiseGrant(grant({
      calls: [{ to: '0x0000000000000000000000000000000000000001', selectors: [] }],
    })))
    expect(wide.calls[0]!.selectors).toEqual([])
  })

  it('preserves the expiry exactly — a charter without one is not a charter', () => {
    expect(deserialiseGrant(serialiseGrant(grant())).expiresAt).toBe(1_800_000_000)
  })
})

describe('InMemoryCharterStore', () => {
  const charter = (id: string): Charter => ({
    id, status: 'active', grant: grant(),
    sessionKeyAddress: '0xd09b8d9e266B87759e505287Ef07633ecae55Ed3',
    grantTxHash: '0xabc', revokeTxHash: null,
    grantedAt: '2026-09-04T21:00:00.000Z', revokedAt: null,
    provider: 'registry', verifyUrl: null,
  })

  const record = (id: string) => ({
    charter: charter(id), policyHash: '0xpolicy', revokeHash: null,
    spent: {}, callsUsed: 0, agentName: 'Keel', grantedBy: 'visitor',
    label: 'Restore a health factor', category: 'health_factor',
  })

  it('returns a copy, so a caller cannot mutate stored state by accident', async () => {
    const store = new InMemoryCharterStore()
    await store.put(record('a'))
    const got = (await store.get('a'))!
    got.charter.status = 'revoked'
    got.spent['tBNB'] = '999'
    const again = (await store.get('a'))!
    expect(again.charter.status).toBe('active')
    expect(again.spent['tBNB']).toBeUndefined()
  })

  it('applies a revocation patch to status, time and transaction together', async () => {
    const store = new InMemoryCharterStore()
    await store.put(record('b'))
    await store.patch('b', {
      status: 'revoked', revokedAt: '2026-09-04T21:30:00.000Z', revokeTxHash: '0xdef',
    })
    const got = (await store.get('b'))!
    expect(got.charter.status).toBe('revoked')
    expect(got.charter.revokedAt).toBe('2026-09-04T21:30:00.000Z')
    expect(got.charter.revokeTxHash).toBe('0xdef')
  })

  it('patching a charter it has never seen is a no-op, not a throw', async () => {
    const store = new InMemoryCharterStore()
    await expect(store.patch('missing', { status: 'revoked' })).resolves.toBeUndefined()
  })

  it('lists newest first and filters by status', async () => {
    const store = new InMemoryCharterStore()
    const older = record('older')
    older.charter.grantedAt = '2026-09-04T20:00:00.000Z'
    const revoked = record('revoked')
    revoked.charter.status = 'revoked'
    revoked.charter.grantedAt = '2026-09-04T22:00:00.000Z'
    await store.put(older)
    await store.put(record('newer'))
    await store.put(revoked)

    const all = await store.list()
    expect(all.map((r) => r.charter.id)).toEqual(['revoked', 'newer', 'older'])
    const active = await store.list({ status: 'active' })
    expect(active.map((r) => r.charter.id)).toEqual(['newer', 'older'])
  })
})
