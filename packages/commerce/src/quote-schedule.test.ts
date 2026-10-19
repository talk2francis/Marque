import { describe, expect, it } from 'vitest'
import { dueQuoteProbes, nextQuoteProbeAt } from './quote-schedule.js'

const minute = 60_000
const at = 1_800_000_000_000
describe('provider-expiry-aware quote observation scheduling', () => {
  it('refreshes fifteen-minute third-party terms before expiry instead of waiting thirty minutes', () => {
    expect(nextQuoteProbeAt(false, { at, ok: true, expiresAt: at + 15 * minute })).toBe(at + 13 * minute)
  })
  it('adapts to five-minute terms and preserves the original observation', () => {
    const last = { at, ok: true, expiresAt: at + 5 * minute }
    expect(nextQuoteProbeAt(false, last)).toBe(at + 225_000)
    expect(last.expiresAt).toBe(at + 5 * minute)
  })
  it('keeps the existing ten-minute first-party cadence when terms allow it', () => {
    expect(nextQuoteProbeAt(true, { at, ok: true, expiresAt: at + 15 * minute })).toBe(at + 10 * minute)
  })
  it('retains failure backoff even when a failed observation includes an expiry', () => {
    expect(nextQuoteProbeAt(false, { at, ok: false, expiresAt: at })).toBe(at + 360 * minute)
    expect(nextQuoteProbeAt(true, { at, ok: false, expiresAt: at })).toBe(at + minute)
  })
  it('bounds retries for already expired or very short-lived successful terms', () => {
    for (const expiresAt of [at - minute, at + 5_000]) {
      expect(nextQuoteProbeAt(false, { at, ok: true, expiresAt })).toBe(at + minute)
    }
  })
  it('uses ordinary cadence for absent or malformed expiry evidence', () => {
    for (const expiresAt of [undefined, Number.NaN]) expect(nextQuoteProbeAt(false, { at, ok: true, expiresAt })).toBe(at + 30 * minute)
  })
  it('prioritizes established successful sellers before background discovery under the pass limit', () => {
    const candidates = [{ serviceId: 1, firstParty: null, advertisesCommerce: false }, { serviceId: 2, firstParty: null, advertisesCommerce: true }, { serviceId: 3, firstParty: {}, advertisesCommerce: true }]
    const last = new Map([[2, { at, ok: true, expiresAt: at + 15 * minute }]])
    expect(dueQuoteProbes(candidates, last, at + 13 * minute, 2).map(c => c.serviceId)).toEqual([3, 2])
    expect(candidates.map(c => c.serviceId)).toEqual([1, 2, 3])
  })
  it('does not refresh early or bypass backoff and becomes due at the exact boundary', () => {
    const seller = { serviceId: 2, firstParty: null, advertisesCommerce: true }
    const last = new Map([[2, { at, ok: true, expiresAt: at + 15 * minute }]])
    expect(dueQuoteProbes([seller], last, at + 13 * minute - 1, 60)).toEqual([])
    expect(dueQuoteProbes([seller], last, at + 13 * minute, 60)).toEqual([seller])
  })
})
