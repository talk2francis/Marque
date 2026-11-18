import { describe, expect, it } from 'vitest'
import { DROPPED_AFTER_MS, LATE_LANDING_WINDOW_MS, RELAY_UNSETTLED_AFTER_MS, droppedTx, lateLanding, staleOutcome } from '../settle.js'
import { choosePathV2 } from '../v2/watch.js'

/** Regression for review R-01 (MC-CL-001) and R-03 (MC-CX-004). */
describe('settle: stale attempts get a terminal state (R-01)', () => {
  const now = 10 * 86_400_000
  it('keeps a young or still-known transaction open', () => {
    expect(staleOutcome({ kind: 'tx', sentAt: now - 60_000, now, txKnown: false })).toBe('keep')
    expect(staleOutcome({ kind: 'tx', sentAt: now - 86_400_000, now, txKnown: true })).toBe('keep')
    expect(staleOutcome({ kind: 'tx', sentAt: null, now, txKnown: false })).toBe('keep')
  })
  it('drops a transaction the node no longer knows after the window', () => {
    expect(staleOutcome({ kind: 'tx', sentAt: now - DROPPED_AFTER_MS, now, txKnown: false })).toBe('dropped')
  })
  it('closes a relay call that never settles', () => {
    expect(staleOutcome({ kind: 'relay', sentAt: now - RELAY_UNSETTLED_AFTER_MS + 1, now })).toBe('keep')
    expect(staleOutcome({ kind: 'relay', sentAt: now - RELAY_UNSETTLED_AFTER_MS, now })).toBe('unsettled')
  })
  it('droppedTx: not found after the window -> dropped; RPC failure -> never dropped; young -> no RPC call', async () => {
    const old = new Date(now - DROPPED_AFTER_MS - 1).toISOString()
    const notFound = { getTransaction: async () => { const e = new Error('not found'); e.name = 'TransactionNotFoundError'; throw e } }
    const rpcDown = { getTransaction: async () => { throw new Error('fetch failed') } }
    const known = { getTransaction: async () => ({ hash: '0x1' }) }
    let calls = 0
    const counting = { getTransaction: async () => { calls += 1; return null } }
    expect(await droppedTx(notFound, '0x1', old, now)).toBe(true)
    expect(await droppedTx(rpcDown, '0x1', old, now)).toBe(false)
    expect(await droppedTx(known, '0x1', old, now)).toBe(false)
    expect(await droppedTx(counting, '0x1', new Date(now - 1_000).toISOString(), now)).toBe(false)
    expect(calls).toBe(0)
  })
  it('once the stuck row is closed, the charter gets a send again (the chooser sees no open attempt)', () => {
    // Before: a backup 'sent' row with no receipt made the chooser wait for ever.
    expect(choosePathV2({ open: { path: 'backup', status: 'sent', sentAt: 0 }, altanaReady: true, direct: false, backup: true, now, graceMs: 120_000 })).toEqual({ action: 'wait' })
    // After reconcile closes it as failed, there is no open row.
    expect(choosePathV2({ open: null, altanaReady: true, direct: false, backup: true, now, graceMs: 120_000 })).toEqual({ action: 'send', path: 'altana', supersede: false })
  })
})

describe('settle: superseded submissions that land late are recorded (R-03)', () => {
  it('maps a late outcome to a terminal status with a reason', () => {
    expect(lateLanding('success')).toEqual({ status: 'confirmed', error: 'landed after it was superseded' })
    expect(lateLanding('confirmed').status).toBe('confirmed')
    expect(lateLanding('reverted').status).toBe('reverted')
    expect(lateLanding('failed').status).toBe('failed')
    expect(LATE_LANDING_WINDOW_MS).toBe(86_400_000)
  })
})
