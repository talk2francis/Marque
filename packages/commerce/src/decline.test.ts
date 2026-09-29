import { describe, expect, it } from 'vitest'
import { declineOf } from './quote.js'
import { jsonTaskExample } from './supply.js'

describe('declineOf', () => {
  it('reads the seller reason from a refused negotiation (chainhelix, 29 Sep)', () => {
    const neg = { accepted: false, response: { accepted: false, reason_code: 'INVALID_TASK_INPUT', reason: 'collateral must be a non-empty array' }, negotiation_hash: '', provider_sig: '' }
    expect(declineOf(neg)).toBe('collateral must be a non-empty array')
  })
  it('is null for an accepted quote', () => {
    expect(declineOf({ response: { accepted: true }, negotiation_hash: '0x1' })).toBeNull()
  })
})

describe('jsonTaskExample', () => {
  it('keeps a JSON object example', () => {
    const ex = '{"collateral":{"ETH":{"amount":10,"liqThreshold":0.8}},"debt":{"USDT":10000},"prices":{"ETH":2000,"USDT":1}}'
    expect(jsonTaskExample(ex)).toBe(ex)
  })
  it('drops prose, arrays and junk', () => {
    expect(jsonTaskExample('Check my loan')).toBeNull()
    expect(jsonTaskExample('[1,2]')).toBeNull()
    expect(jsonTaskExample(42)).toBeNull()
  })
})
