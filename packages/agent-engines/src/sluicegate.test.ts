import { describe, expect, it } from 'vitest'
import { parseAsk } from './sluicegate.js'

/**
 * The ADV-03 benchmark task, frozen and hashed before either arm ran. The
 * agent refused it — "the task does not state the APR currently earned" —
 * because the extractor only matched the gerund "currently earning", not the
 * registered phrasing "currently earns 0% APR". That is a parser defect, not a
 * missing fact; this pins the shape so it cannot regress.
 */
const ADV_03 = [
  'Find the best net-of-cost route for 1,000 USD of USDT on BNB Smart Chain (chain 56).',
  'Block: 120077706 — answer for this block.',
  '',
  'Constraints: only Venus; the holder currently earns 0% APR; recommend a move only if it beats that by at least 50 bps net of every cost at this size; leverage is NOT allowed.',
  '',
  'Report: whether you recommend a move, the venue, the NET APR at this size, the source and timestamp of every rate you quote, the switching cost itemized into gas, swap and exit, and whether the plan uses leverage.',
].join('\n')

describe('sluicegate parseAsk', () => {
  it('parses the frozen ADV-03 task without refusing', () => {
    const ask = parseAsk(ADV_03)
    expect('missing' in ask).toBe(false)
    if ('missing' in ask) return
    expect(ask.asset).toBe('USDT')
    expect(ask.sizeUsd).toBe(1000)
    expect(ask.allowedProtocols).toContain('venus')
    expect(ask.minImprovementBps).toBe(50)
    expect(ask.currentAprPct).toBe(0)
    expect(ask.leverageAllowed).toBe(false)
  })

  it('still reads the gerund phrasing', () => {
    const ask = parseAsk('Route 5,000 USD of USDT. allowed protocols venus. currently earning 3.2%. at least 50 bps.')
    expect('missing' in ask).toBe(false)
    if (!('missing' in ask)) expect(ask.currentAprPct).toBe(3.2)
  })

  it('still refuses when the current APR is genuinely absent', () => {
    const ask = parseAsk('Route 1,000 USD of USDT. allowed protocols venus. at least 50 bps net.')
    expect('missing' in ask).toBe(true)
    if ('missing' in ask) expect(ask.missing).toContain('the APR currently earned')
  })

  it('reads a thousands-separated size as the whole number, not the tail', () => {
    const ask = parseAsk('Route 1,000 USD of USDT. allowed protocols venus. currently earns 0% APR. at least 50 bps.')
    if (!('missing' in ask)) expect(ask.sizeUsd).toBe(1000)
  })
})
