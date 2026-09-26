import { describe, it, expect } from 'vitest'
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, encodeErrorResult } from 'viem'
import { agenticCommerceAbi, evaluatorRouterAbi, optimisticPolicyAbi } from './generated.js'
import { CONTRACT_ERRORS, WALLET_ERRORS, friendlyError } from './errors.js'

const errorNames = (abi: readonly unknown[]) => (abi as Array<{ type: string; name?: string }>).filter((x) => x.type === 'error').map((x) => x.name!)

describe('error map coverage', () => {
  for (const [label, abi] of [['AgenticCommerce', agenticCommerceAbi], ['EvaluatorRouter', evaluatorRouterAbi], ['OptimisticPolicy', optimisticPolicyAbi]] as const) {
    it(`covers every custom error in ${label}`, () => {
      const missing = errorNames(abi).filter((n) => !CONTRACT_ERRORS[n])
      expect(missing).toEqual([])
    })
  }
  it('covers the wallet codes the pack requires', () => {
    for (const c of ['4001', '4902', '-32002']) expect(WALLET_ERRORS[c]).toBeDefined()
  })
  it('never contains an em or en dash in user copy', () => {
    for (const e of [...Object.values(CONTRACT_ERRORS), ...Object.values(WALLET_ERRORS)]) expect(`${e.title} ${e.action}`).not.toMatch(/[–—]/)
  })
})

describe('friendlyError', () => {
  it('maps a decoded contract revert by error name', () => {
    const data = encodeErrorResult({ abi: agenticCommerceAbi as never, errorName: 'BudgetMismatch' as never, args: [] as never })
    const err = new BaseError('reverted', { cause: new ContractFunctionRevertedError({ abi: agenticCommerceAbi as never, data, functionName: 'fund' }) })
    expect(friendlyError(err).code).toBe('BudgetMismatch')
  })
  it('maps a wallet rejection', () => {
    expect(friendlyError(new BaseError('x', { cause: new UserRejectedRequestError(new Error('User rejected')) })).code).toBe('4001')
    expect(friendlyError({ code: 4001 }).code).toBe('4001')
    expect(friendlyError({ code: -32002 }).code).toBe('-32002')
  })
  it('maps missing gas and an unknown failure without echoing raw text', () => {
    expect(friendlyError(new Error('insufficient funds for gas * price + value')).code).toBe('insufficient_gas')
    const g = friendlyError(new Error('Internal JSON-RPC error: 0xdeadbeef stack trace at foo.js:1'))
    expect(g.code).toBe('unknown')
    expect(`${g.title}${g.action}`).not.toMatch(/deadbeef|JSON-RPC|foo\.js/)
  })
})
