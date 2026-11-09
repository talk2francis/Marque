import { describe, expect, it } from 'vitest'
import { BaseError, encodeErrorResult } from 'viem'
import { loanGuardAbi } from '@marque/charters'
import { choosePath, relayOutcome, revertReason } from './watch'

describe('relay outcomes', () => {
  it('reads EIP-5792 status codes the way the SDK does', () => {
    expect(relayOutcome(200)).toBe('confirmed')
    expect(relayOutcome('CONFIRMED')).toBe('confirmed')
    expect(relayOutcome(100)).toBe('pending')
    expect(relayOutcome(400)).toBe('failed')
    expect(relayOutcome(500)).toBe('failed')
    expect(relayOutcome(600)).toBe('failed')
    expect(relayOutcome(700)).toBe('pending') // out of band: keep waiting, never guess a failure
    expect(relayOutcome(undefined)).toBe('pending')
  })
})

describe('who presses the button', () => {
  const now = 1_000_000
  it('Keel first when its session is ready, the backup otherwise', () => {
    expect(choosePath({ open: null, altanaReady: true, now, graceMs: 30_000 })).toEqual({ action: 'send', path: 'altana', supersede: false })
    expect(choosePath({ open: null, altanaReady: false, now, graceMs: 30_000 })).toEqual({ action: 'send', path: 'backup', supersede: false })
  })
  it('waits for Keel inside the grace window, then hands over to the backup', () => {
    const pending = { path: 'altana' as const, status: 'pending', sentAt: now - 10_000 }
    expect(choosePath({ open: pending, altanaReady: true, now, graceMs: 30_000 })).toEqual({ action: 'wait' })
    expect(choosePath({ open: { ...pending, sentAt: now - 30_000 }, altanaReady: true, now, graceMs: 30_000 })).toEqual({ action: 'send', path: 'backup', supersede: true })
  })
  it('never sends twice for a backup already in flight, or a prepared attempt', () => {
    expect(choosePath({ open: { path: 'backup', status: 'sent', sentAt: now - 120_000 }, altanaReady: true, now, graceMs: 30_000 })).toEqual({ action: 'wait' })
    expect(choosePath({ open: { path: 'altana', status: 'prepared', sentAt: null }, altanaReady: true, now, graceMs: 30_000 })).toEqual({ action: 'wait' })
  })
})

describe('revert reasons', () => {
  it('names the guard\'s own errors', () => {
    const data = encodeErrorResult({ abi: loanGuardAbi, errorName: 'Healthy', args: [15n * 10n ** 17n, 13n * 10n ** 17n] })
    const err = Object.assign(new Error('execution reverted'), {})
    // A viem-shaped error carrying revert data, as eth_call returns it.
    const be = new BaseError('execution reverted', { cause: Object.assign(new Error('rpc'), { data }) as never })
    expect(revertReason(be)).toBe('Healthy')
    expect(revertReason(err)).toBe('execution reverted')
  })
})
