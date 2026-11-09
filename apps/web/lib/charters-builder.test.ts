import { describe, expect, it } from 'vitest'
import { decodeFunctionData, erc20Abi, type Address } from 'viem'
import { CHARTER_CHAINS, charterFactoryAbi } from '@marque/charters/client'
import {
  cannotBatch, clampRule, expiryFor, expiryStillValid, grantCalls, presetRule, readBudget, roundUpBudget, sentence, suggestBudget, tipFor, tokens,
} from './charters-builder'

const E18 = 10n ** 18n
const E6 = 10n ** 6n

describe('the rule stays inside the factory bounds', () => {
  it('clamps the trigger to 1.02..10.00 and keeps the target at least 0.05 above it, at most 20.00', () => {
    expect(clampRule(90, 95)).toEqual({ trigger: 102, target: 107 })
    expect(clampRule(130, 131)).toEqual({ trigger: 130, target: 135 })
    expect(clampRule(1200, 2500)).toEqual({ trigger: 1000, target: 2000 })
  })
  it('Test it now sits 0.05 above health now and the target 0.10 above that', () => {
    expect(presetRule('test', 1.0757)).toEqual({ trigger: 113, target: 123 })
    expect(presetRule('steady', 2)).toEqual({ trigger: 130, target: 180 })
  })
})

describe('budget', () => {
  it('rounds up to two significant whole tokens', () => {
    expect(roundUpBudget(4_432_790_794_845_056_589_608n, 18)).toBe(4_500n * E18)
    expect(roundUpBudget(38_095_238n, 6)).toBe(39n * E6)
    expect(roundUpBudget(400_000n, 6)).toBe(1n * E6)
    expect(roundUpBudget(0n, 6)).toBe(0n)
    expect(roundUpBudget(100n * E6, 6)).toBe(100n * E6)
  })
  it('never suggests more than the wallet holds', () => {
    expect(suggestBudget(4_432n * E18, 18, 1_000n * E18)).toBe(1_000n * E18)
    expect(suggestBudget(38n * E6, 6, null)).toBe(38n * E6)
  })
  it('reads plain decimals only', () => {
    expect(readBudget('500', 6)).toEqual({ value: 500n * E6 })
    expect(readBudget('1e3', 6)).toHaveProperty('error')
    expect(readBudget('-5', 6)).toHaveProperty('error')
    expect(readBudget('0.0000001', 6)).toHaveProperty('error')
    expect(readBudget('0', 6)).toHaveProperty('error')
    expect(readBudget('', 6)).toHaveProperty('error')
  })
  it('keeps every tip under the factory limit of a tenth of the budget', () => {
    for (const c of ['none', 'small', 'larger'] as const) expect(tipFor(c, 500n * E6) <= 50n * E6).toBe(true)
    expect(tipFor('none', 500n * E6)).toBe(0n)
  })
  it('formats amounts without exponents', () => {
    expect(tokens(4_500n * E18, 18)).toBe('4,500')
    expect(tokens(38_095_238n, 6)).toBe('38.09')
    expect(tokens(1_234n, 6)).toBe('0.0012')
  })
})

describe('expiry', () => {
  const now = 1_800_000_000
  it('keeps an hour of margin under the 90-day maximum and leaves shorter choices exact', () => {
    expect(expiryFor(90, now)).toBe(BigInt(now + 90 * 86_400 - 3600))
    expect(expiryFor(30, now)).toBe(BigInt(now + 30 * 86_400))
  })
  it('says when a retry can no longer use the same expiry', () => {
    const e = expiryFor(90, now)
    expect(expiryStillValid(e, now + 600)).toBe(true)
    expect(expiryStillValid(e, now + 7200)).toBe(true) // a later create only loosens the maximum
    expect(expiryStillValid(e, now - 7200)).toBe(false) // a device clock two hours ahead would not
    expect(expiryStillValid(expiryFor(7, now), now + 6 * 86_400)).toBe(false)
  })
})

it('builds the grant as an exact allowance to the predicted guard, then the create', () => {
  const c = CHARTER_CHAINS[97]
  const usdc = c.markets[1]!
  const predicted = '0x18737A81cEDEBD7a6979db61639B80F0f7D8B98c' as Address
  const p = { vDebt: usdc.vToken, trigger: 13n * 10n ** 17n, target: 18n * 10n ** 17n, budget: 150n * E6, tip: 0n, expiresAt: 1_800_000_000n }
  const [a, b] = grantCalls(97, usdc.token, predicted, p, `0x${'ab'.repeat(32)}`)
  expect(a!.to).toBe(usdc.token)
  expect(decodeFunctionData({ abi: erc20Abi, data: a!.data }).args).toEqual([predicted, 150n * E6])
  expect(b!.to).toBe(c.factory)
  const d = decodeFunctionData({ abi: charterFactoryAbi, data: b!.data })
  expect(d.functionName).toBe('create')
  expect(() => grantCalls(56, usdc.token, predicted, p, `0x${'ab'.repeat(32)}`)).toThrow()
})

it('falls back to one prompt per step only when the wallet cannot batch, never after a refusal', () => {
  expect(cannotBatch({ code: 4200, message: 'Unsupported method' })).toBe(true)
  expect(cannotBatch({ code: -32601, message: 'Method not found' })).toBe(true)
  expect(cannotBatch({ name: 'UnsupportedProviderMethodError', message: 'x' })).toBe(true)
  expect(cannotBatch({ message: 'wallet_sendCalls is not supported' })).toBe(true)
  expect(cannotBatch({ code: 4001, message: 'User rejected the request.' })).toBe(false)
  expect(cannotBatch({ message: 'execution reverted' })).toBe(false)
})

it('writes the sentence a person reads aloud', () => {
  expect(sentence({ trigger: 130, target: 180, budget: '500', symbol: 'USDT', until: '8 Dec' }))
    .toBe('If my loan health falls below 1.30, repay my USDT loan back to 1.80, using up to 500 USDT from my wallet, until 8 Dec.')
})
