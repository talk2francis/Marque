import { describe, expect, it } from 'vitest'
import { zeroAddress } from 'viem'
import { remainingPaymentCalls, type HireTerms } from './calls'
import { network } from './config'
const n = network(56)
const buyer = '0x1111111111111111111111111111111111111111'
const t: HireTerms = { chainId: 56, provider: '0x2222222222222222222222222222222222222222', token: n.assets[0]!, price: 10n, priceLabel: '10 fixture', agentName: 'fixture', expiredAt: BigInt(Math.floor(Date.now()/1000)+3600), description: 'exact signed terms' }
const j = { client: buyer, provider: t.provider, evaluator: n.router, hook: n.router, expiredAt: t.expiredAt, description: t.description, budget: 0n, status: 0 }
const plan = (job = j, policy: string = zeroAddress, allowance = 0n, token: string = t.token.address) => remainingPaymentCalls(t, 123n, allowance, buyer, job, policy, token)
describe('chain-driven payment recovery', () => {
  it('constructs only exact approval and the normal setup for an open job', () => { const calls = plan(); expect(calls.map(c=>c.step)).toEqual(['registerJob','setBudget','approve','fund']); expect(calls.find(c=>c.step==='approve')!.args[1]).toBe(10n) })
  it('skips existing registration, budget and sufficient allowance', () => { expect(plan({...j,budget:10n},n.policy,10n).map(c=>c.step)).toEqual(['fund']) })
  it('never funds a funded, delivered or completed job again', () => { for(const status of [1,2,3]) expect(plan({...j,budget:10n,status},n.policy)).toEqual([]) })
  it('refuses a closed job', () => { for(const status of [4,5,6]) expect(()=>plan({...j,status})).toThrow('closed') })
  it.each(['client','provider','evaluator','hook','description'] as const)('refuses changed %s', key => { expect(()=>plan({...j,[key]: key==='description'?'changed':zeroAddress})).toThrow('differs') })
  it('refuses changed expiry or asset', () => { expect(()=>plan({...j,expiredAt:j.expiredAt+1n})).toThrow('differs'); expect(()=>plan(j,zeroAddress,0n,zeroAddress)).toThrow('differs') })
  it('refuses different policy, budget or unprotected funded job', () => { expect(()=>plan(j,buyer)).toThrow('policy'); expect(()=>plan({...j,budget:11n})).toThrow('budget'); expect(()=>plan({...j,status:1,budget:10n})).toThrow('protected') })
})
