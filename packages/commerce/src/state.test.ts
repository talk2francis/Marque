import { describe, it, expect } from 'vitest'
import { projectJob, timeline, type JobEvent, type JobEventName } from './state.js'
import { computeExpiredAt, approvalNeeded, paymentCalls, createJobCall, approveCall, type HireTerms } from './calls.js'
import { NETWORKS } from './config.js'

let n = 0
const ev = (name: JobEventName, args: Record<string, unknown> = {}): JobEvent => ({ name, blockNumber: ++n, logIndex: 0, txHash: `0x${n.toString(16).padStart(64, '0')}`, args })
const created = () => ev('JobCreated', { client: '0xc', provider: '0xp', evaluator: '0xr', hook: '0xr', expiredAt: 2000n })

describe('job state machine: every legal path', () => {
  it('open, register, budget, fund, submit, complete, paid', () => {
    const p = projectJob([created(), ev('JobRegistered'), ev('BudgetSet', { amount: 10n }), ev('JobFunded', { amount: 10n }), ev('JobSubmitted', { deliverable: '0xd' }), ev('JobCompleted'), ev('PaymentReleased', { amount: 10n })])
    expect(p.state).toBe('PAID')
    expect(p).toMatchObject({ registered: true, budgetSet: true, budgetRaw: '10', fundedRaw: '10', paidRaw: '10', deliverable: '0xd', client: '0xc', provider: '0xp', expiredAt: 2000 })
    expect(Object.keys(p.tx).sort()).toEqual(['budgetSet', 'completed', 'created', 'funded', 'paymentReleased', 'registered', 'submitted'])
    expect(p.anomalies).toEqual([])
  })
  it('budget before register is fine', () => {
    expect(projectJob([created(), ev('BudgetSet', { amount: 1n }), ev('JobRegistered'), ev('JobFunded', { amount: 1n })]).state).toBe('FUNDED')
  })
  it('budget and fund in the same transaction (mainnet job 56784 shape)', () => {
    const c = created()
    const b = { ...ev('BudgetSet', { amount: 5n }), blockNumber: 900, logIndex: 1 }
    const f = { ...ev('JobFunded', { amount: 5n }), blockNumber: 900, logIndex: 2 }
    expect(projectJob([f, b, c]).state).toBe('FUNDED')
  })
  it('cancel before funding', () => {
    expect(projectJob([created(), ev('JobRejected')]).state).toBe('CANCELLED')
  })
  it('expire, then refund', () => {
    expect(projectJob([created(), ev('JobFunded', { amount: 3n }), ev('JobExpired')]).state).toBe('EXPIRED')
    const p = projectJob([created(), ev('JobFunded', { amount: 3n }), ev('JobExpired'), ev('Refunded', { amount: 3n })])
    expect(p.state).toBe('REFUNDED')
    expect(p.refundedRaw).toBe('3')
  })
  it('claimRefund straight from funded (no JobExpired event)', () => {
    expect(projectJob([created(), ev('JobFunded'), ev('Refunded')]).state).toBe('REFUNDED')
  })
  it('dispute, then rejected and refunded', () => {
    expect(projectJob([created(), ev('JobFunded'), ev('JobSubmitted'), ev('Disputed')]).state).toBe('DISPUTED')
    expect(projectJob([created(), ev('JobFunded'), ev('JobSubmitted'), ev('Disputed'), ev('JobSettled'), ev('JobRejected'), ev('Refunded')]).state).toBe('REFUNDED')
  })
  it('dispute that fails still completes', () => {
    expect(projectJob([created(), ev('JobFunded'), ev('JobSubmitted'), ev('Disputed'), ev('JobCompleted'), ev('PaymentReleased')]).state).toBe('PAID')
  })
  it('settle without a dispute keeps the job submitted until JobCompleted', () => {
    expect(projectJob([created(), ev('JobFunded'), ev('JobSubmitted'), ev('JobSettled')]).state).toBe('SUBMITTED')
  })
})

describe('job state machine: illegal transitions are recorded, not applied', () => {
  const cases: Array<[string, JobEventName[], string]> = [
    ['submit before fund', ['JobSubmitted'], 'OPEN'],
    ['fund twice', ['JobFunded', 'JobFunded'], 'FUNDED'],
    ['register after fund', ['JobFunded', 'JobRegistered'], 'FUNDED'],
    ['complete while funded', ['JobFunded', 'JobCompleted'], 'FUNDED'],
    ['payment before completion', ['JobFunded', 'JobSubmitted', 'PaymentReleased'], 'SUBMITTED'],
    ['refund after payment', ['JobFunded', 'JobSubmitted', 'JobCompleted', 'PaymentReleased', 'Refunded'], 'PAID'],
    ['dispute before delivery', ['JobFunded', 'Disputed'], 'FUNDED'],
    ['refund of a cancelled job', ['JobRejected', 'Refunded'], 'CANCELLED'],
  ]
  for (const [label, names, expected] of cases) {
    it(label, () => {
      const p = projectJob([created(), ...names.map((x) => ev(x))])
      expect(p.state).toBe(expected)
      expect(p.anomalies.length).toBe(1)
    })
  }
  it('an event before JobCreated is an anomaly', () => {
    expect(projectJob([ev('JobFunded')]).anomalies.length).toBe(1)
  })
})

describe('timeline', () => {
  it('computes deadlines from the measured dispute window', () => {
    const t = timeline({ state: 'FUNDED', expiredAt: 10_000 }, null, 900, 9_500)
    expect(t).toMatchObject({ submitDeadline: 9_100, refundFrom: 10_000, awaitingExpiry: true, refundable: false })
    expect(timeline({ state: 'FUNDED', expiredAt: 10_000 }, null, 900, 10_000).refundable).toBe(true)
    expect(timeline({ state: 'SUBMITTED', expiredAt: 10_000 }, 5_000, 900, 5_500)).toMatchObject({ disputable: true, settleable: false })
    expect(timeline({ state: 'SUBMITTED', expiredAt: 10_000 }, 5_000, 900, 5_900)).toMatchObject({ disputable: false, settleable: true })
    expect(timeline({ state: 'OPEN', expiredAt: 10_000 }, null, 900, 1).cancellable).toBe(true)
  })
})

describe('hire calls', () => {
  const t: HireTerms = {
    chainId: 97, provider: '0x0000000000000000000000000000000000000001', token: { address: NETWORKS[97].kernelToken, symbol: 'U', decimals: 18, isDefault: true },
    price: 5n, priceLabel: '0.000005 U', agentName: 'Keel', expiredAt: 99n, description: '{}',
  }
  it('createJob names the router as evaluator and hook (SPEC 13.10 gotcha 1)', () => {
    const c = createJobCall(t)
    expect(c.functionName).toBe('createJob')
    expect(c.args[1]).toBe(NETWORKS[97].router)
    expect(c.args[4]).toBe(NETWORKS[97].router)
    expect(c.to).toBe(NETWORKS[97].commerce)
  })
  it('a non-default token uses createJobWithToken', () => {
    const c = createJobCall({ ...t, token: { address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', symbol: 'USDT', decimals: 18, isDefault: false } })
    expect(c.functionName).toBe('createJobWithToken')
    expect(c.args[5]).toBe('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd')
  })
  it('approves exactly the price, only when short, and never unlimited', () => {
    expect(approvalNeeded(10n, 5n)).toBeNull()
    expect(approvalNeeded(4n, 5n)).toBe(5n)
    expect(paymentCalls(t, 7n, 0n).map((c) => c.step)).toEqual(['registerJob', 'setBudget', 'approve', 'fund'])
    expect(paymentCalls(t, 7n, 5n).map((c) => c.step)).toEqual(['registerJob', 'setBudget', 'fund'])
    expect(paymentCalls(t, 7n, 0n).find((c) => c.step === 'approve')!.args[1]).toBe(5n)
    expect(() => approveCall(97, t.token, 2n ** 256n - 1n, 'x')).toThrow(/unlimited/)
  })
  it('setBudget and fund use the same amount (BudgetMismatch guard)', () => {
    const calls = paymentCalls(t, 7n, 0n)
    expect(calls.find((c) => c.step === 'setBudget')!.args[1]).toBe(calls.find((c) => c.step === 'fund')!.args[1])
  })
  it('every step has plain words and no dashes', () => {
    for (const c of [createJobCall(t), ...paymentCalls(t, 7n, 0n)]) expect(`${c.label} ${c.detail}`).not.toMatch(/[–—]/)
  })
  it('expiry covers the dispute window plus a bounded delivery allowance', () => {
    expect(computeExpiredAt(1000, 900, 600)).toBe(BigInt(1000 + 900 + 3600))
    expect(computeExpiredAt(1000, 604800, 7200)).toBe(BigInt(1000 + 604800 + 21600))
    expect(computeExpiredAt(1000, 604800, 999999)).toBe(BigInt(1000 + 604800 + 86400))
    expect(() => computeExpiredAt(0, 400 * 86400, 1)).toThrow()
  })
})

describe('claimRefund log order (testnet job 1350)', () => {
  it('Refunded then JobExpired in one tx ends REFUNDED with no anomaly', () => {
    const e = (name: string, i: number, args: Record<string, unknown> = {}) => ({ name: name as never, blockNumber: 1, logIndex: i, txHash: '0xt', args })
    const p = projectJob([
      { ...e('JobCreated', 0, { client: '0xc', provider: '0xp' }), blockNumber: 0 },
      { ...e('JobFunded', 1, { amount: 10n }), blockNumber: 0 },
      e('Refunded', 2, { amount: 10n }), e('JobExpired', 3),
    ])
    expect(p.state).toBe('REFUNDED')
    expect(p.anomalies).toEqual([])
  })
})
