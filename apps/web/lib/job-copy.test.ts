import { describe, expect, it } from 'vitest'
import { jobHeadline } from './job-copy'
const copy = (state: string, end: number | null = null) => jobHeadline(state, 'Outside agent', '0.01 U', end, null, false)
describe('job room evidence copy', () => {
  it('never calls completion a confirmed payment', () => {
    expect(copy('COMPLETED').title).toBe('Delivery accepted; payment release unconfirmed')
    expect(copy('COMPLETED').body).toContain('separate PaymentReleased event')
    expect(copy('PAID').body).toContain('indexed PaymentReleased')
  })
  it('does not promise automatic settlement on delivery', () => {
    expect(copy('SUBMITTED', 1800000000).body).toContain('separate chain events')
    expect(copy('SUBMITTED').body).toContain('end time is unavailable')
    expect(copy('FUNDED').title).toBe('Escrow funded; waiting for delivery')
    expect(copy('FUNDED').body).toContain('delivery, review and settlement remain pending')
  })
  it.each(['OPEN', 'CANCELLED'])('distinguishes escrow funding from prior network fees: %s', state => {
    expect(copy(state).body).toContain('network fees may still apply')
    expect(copy(state).body).not.toContain('Nothing was charged')
  })
  it.each(['DISPUTED', 'EXPIRED', 'REFUNDED', 'REJECTED'])('retains failure and recovery state: %s', state => {
    expect(copy(state).title).not.toBe('Done. Outside agent was paid.')
    expect(copy(state).body.length).toBeGreaterThan(0)
  })
})
