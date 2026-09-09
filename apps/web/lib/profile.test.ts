import { describe, expect, it } from 'vitest'
import { mergeActivity, earliest, type ProfileRun, type ProfileSeal } from './profile'
import type { CharterView } from './charters'

function charter(over: Partial<CharterView>): CharterView {
  return {
    id: 'c1', provider: 'registry', status: 'active', agentId: 'marque:bound',
    agentName: 'Bound', category: 'rebalancing', ownerAddress: '0xabc',
    sessionKeyAddress: null, grantTxHash: '0xgrant', revokeTxHash: null,
    policyHash: '0xp', label: null,
    grantedAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-09-02T00:00:00.000Z',
    revokedAt: null, callsUsed: 0,
    caps: [{ symbol: 'tBNB', decimals: 18, limitRaw: '1', spentRaw: '0', limit: 0.01, spent: 0, remaining: 0.01, period: 'total' }],
    contracts: [], secondsRemaining: 3600, fromChain: false, blockNumber: null,
    ...over,
  }
}

function run(over: Partial<ProfileRun>): ProfileRun {
  return {
    id: 'r1', agentId: 'marque:keel', agentName: 'Keel', category: 'health_factor',
    kind: 'health_factor', status: 'complete', ok: true, failure: null, feeUsd: 0.21,
    startedAt: '2026-09-03T00:00:00.000Z', finishedAt: '2026-09-03T00:01:00.000Z',
    hasReceipt: true, receiptAnchored: true,
    ...over,
  }
}

function seal(over: Partial<ProfileSeal>): ProfileSeal {
  return {
    hash: '0xseal', agentId: 'marque:keel', category: 'health_factor',
    blockNumber: '120000000', issuedAt: '2026-09-04T00:00:00.000Z',
    outcome: 'unresolved', resolvedAt: null, chainId: 97, sealTxHash: '0xtx',
    ...over,
  }
}

describe('earliest', () => {
  it('returns the minimum valid ISO date', () => {
    expect(earliest(['2026-09-05T00:00:00Z', '2026-09-01T00:00:00Z', '2026-09-09T00:00:00Z']))
      .toBe('2026-09-01T00:00:00.000Z')
  })
  it('ignores nulls and unparseable strings', () => {
    expect(earliest([null, undefined, 'not a date', '2026-09-07T00:00:00Z']))
      .toBe('2026-09-07T00:00:00.000Z')
  })
  it('is null when nothing is dated', () => {
    expect(earliest([null, undefined, 'x'])).toBeNull()
  })
})

describe('mergeActivity', () => {
  it('is newest-first across every source', () => {
    const items = mergeActivity({
      charters: [charter({})],
      runs: [run({})],
      seals: [seal({})],
    })
    const times = items.map((i) => Date.parse(i.at))
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(items[0]!.kind).toBe('seal_issued') // 09-04 is the latest
  })

  it('emits a grant and a revoke for a revoked charter, and marks the revoke on-chain', () => {
    const items = mergeActivity({
      charters: [charter({ status: 'revoked', revokedAt: '2026-09-01T12:00:00.000Z', revokeTxHash: '0xrev' })],
      runs: [], seals: [],
    })
    expect(items.map((i) => i.kind)).toEqual(['charter_revoked', 'charter_granted'])
    expect(items.find((i) => i.kind === 'charter_revoked')!.provenance).toBe('ONCHAIN')
  })

  it('emits an expiry event only for an expired, never-revoked charter', () => {
    const expired = mergeActivity({ charters: [charter({ status: 'expired' })], runs: [], seals: [] })
    expect(expired.some((i) => i.kind === 'charter_expired')).toBe(true)
    const active = mergeActivity({ charters: [charter({ status: 'active' })], runs: [], seals: [] })
    expect(active.some((i) => i.kind === 'charter_expired')).toBe(false)
  })

  it('emits hire_finished only when the run finished, and carries the failure reason', () => {
    const running = mergeActivity({ charters: [], runs: [run({ ok: null, finishedAt: null, hasReceipt: false })], seals: [] })
    expect(running.map((i) => i.kind)).toEqual(['hire_started'])

    const failed = mergeActivity({
      charters: [], seals: [],
      runs: [run({ ok: false, failure: 'agent refused the task', feeUsd: null, hasReceipt: false })],
    })
    const fin = failed.find((i) => i.kind === 'hire_finished')!
    expect(fin.label).toContain('failed')
    expect(fin.detail).toBe('agent refused the task')
  })

  it('drops items with an invalid timestamp rather than NaN-sorting them', () => {
    const items = mergeActivity({
      charters: [charter({ grantedAt: 'nonsense' })],
      runs: [run({})], seals: [],
    })
    expect(items.every((i) => !Number.isNaN(Date.parse(i.at)))).toBe(true)
    expect(items.some((i) => i.kind === 'charter_granted')).toBe(false)
  })
})
