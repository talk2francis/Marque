import { expect, it } from 'vitest'
import { encodeFunctionData, erc20Abi, type Hex } from 'viem'
import { CHARTER_CHAINS, charterFactoryAbi, loanGuardAbi } from '@marque/charters/client'
import { describe as words } from './PassHost'

const chain = CHARTER_CHAINS[97]
const usdc = chain.markets[1]!
const guard = '0x18737A81cEDEBD7a6979db61639B80F0f7D8B98c' as Hex
const approve = (amount: bigint) => ({ to: usdc.token as Hex, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [guard, amount] }), value: 0n })
const create = { to: chain.factory! as Hex, value: 0n, data: encodeFunctionData({ abi: charterFactoryAbi, functionName: 'create', args: [{ vDebt: usdc.vToken, trigger: 13n * 10n ** 17n, target: 18n * 10n ** 17n, budget: 150_000_000n, tip: 0n, expiresAt: 1_796_000_000n }, `0x${'11'.repeat(32)}`] }) }
const tx = (t: { to: Hex; data: Hex; value: bigint }) => ({ kind: 'transaction' as const, chainId: 97 as const, tx: t, feeWei: 0n, sponsored: false })

it('reads a grant batch in the words of the charter, with 6-decimal testnet USDC', () => {
  const batch = [approve(150_000_000n), create]
  expect(words(tx(batch[0]!), batch)).toBe('Allow your new Loan Guard (0x1873…B98c) to take up to 150 USDC, only when your loan needs it')
  expect(words(tx(create), batch)).toBe('Create your Loan Guard: below health 1.30 it repays your USDC loan back to 1.80, using at most 150 USDC from your wallet, until 30 Nov 2026')
})

it('reads end, clear and protect-now plainly, and never calls a guard approval the escrow', () => {
  expect(words(tx({ to: guard, value: 0n, data: encodeFunctionData({ abi: loanGuardAbi, functionName: 'end' }) }))).toBe('End the Loan Guard 0x1873…B98c for good. It moves no money')
  expect(words(tx(approve(0n)))).toBe('Clear the USDC allowance you gave 0x1873…B98c')
  expect(words(tx({ to: guard, value: 0n, data: encodeFunctionData({ abi: loanGuardAbi, functionName: 'act' }) }))).toMatch(/^Protect your loan now/)
})
