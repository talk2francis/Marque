import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createPublicClient, createTestClient, createWalletClient, http, parseAbi, parseUnits, type Address, type PublicClient } from 'viem'
import { bsc } from 'viem/chains'
import { measure, plan, type Intent } from './act.js'

/**
 * Fork tests (SPEC-ACT 6): BSC mainnet forked at a pinned block with anvil. A real Venus borrower is
 * impersonated; Marque plans, simulates and executes, then measures. Run with BSC_FORK_RPC set to an
 * archive RPC; skipped otherwise.
 */
const RPC = process.env['BSC_FORK_RPC']
const PINNED = 129_489_000n
const PORT = 8600 + Math.floor(Math.random() * 300)
const BORROWER = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf' as Address // the published MCS-HF-1 subject, HF about 1.09
const WHALE = '0xF977814e90dA44bFA03b6295A0616a897441aceC' as Address // a large USDT holder, used only to fund the fork
const USDT = '0x55d398326f99059fF775485246999027B3197955' as Address
const erc = parseAbi(['function transfer(address,uint256) returns (bool)'])

describe.skipIf(!RPC)('act on a BSC mainnet fork', () => {
  let anvil: ChildProcess
  let client: PublicClient
  const url = `http://127.0.0.1:${PORT}`
  const test = createTestClient({ chain: bsc, mode: 'anvil', transport: http(url) })
  const send = async (from: Address, to: Address, data: `0x${string}`) => {
    await test.impersonateAccount({ address: from })
    const w = createWalletClient({ account: from, chain: bsc, transport: http(url) })
    const hash = await w.sendTransaction({ account: from, to, data, chain: bsc })
    const r = await client.waitForTransactionReceipt({ hash })
    expect(r.status).toBe('success')
    return r
  }

  beforeAll(async () => {
    anvil = spawn('anvil', ['--fork-url', RPC!, '--fork-block-number', PINNED.toString(), '--port', String(PORT), '--chain-id', '56', '--silent'], { stdio: 'ignore' })
    client = createPublicClient({ chain: bsc, transport: http(url) }) as PublicClient
    for (let i = 0; i < 60; i++) { try { await client.getBlockNumber(); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
    await test.setBalance({ address: BORROWER, value: parseUnits('1', 18) })
    await test.setBalance({ address: WHALE, value: parseUnits('1', 18) })
    await send(WHALE, USDT, (await import('viem')).encodeFunctionData({ abi: erc, functionName: 'transfer', args: [BORROWER, parseUnits('20000', 18)] }))
  }, 120_000)
  afterAll(() => { anvil?.kill() })

  it('repays to the target: the measured health factor lands within 0.002 of the prediction', async () => {
    const intent: Intent = { action: 'repay', targetHf: 1.5, market: 'USDT', agentHf: null, agentRepayUsd: null, account: BORROWER, atBlock: PINNED }
    const p = await plan({ client, user: BORROWER, intent, positionAccount: BORROWER })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.calls.map((c) => c.kind)).toEqual(['approval', 'repay'])
    // Exact approval: the approve amount equals the repay amount, never max.
    expect(p.calls[0]!.data.endsWith(BigInt(p.amountRaw).toString(16).padStart(64, '0'))).toBe(true)
    let last
    for (const c of p.calls) last = await send(BORROWER, c.to, c.data)
    const after = await measure(client, BORROWER, p.market.vToken, p.market.decimals, last!.blockNumber)
    expect(after!.healthFactor).not.toBeNull()
    expect(Math.abs(after!.healthFactor! - p.predicted.healthFactor!)).toBeLessThan(0.002)
    expect(Math.abs(after!.healthFactor! - 1.5)).toBeLessThan(0.01)
  }, 180_000)

  it('supplies: the measured supply rises by the planned amount', async () => {
    const intent: Intent = { action: 'supply', asset: 'USDT', sizeUsd: 100, atBlock: null }
    const p = await plan({ client, user: BORROWER, intent })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    let last
    for (const c of p.calls) last = await send(BORROWER, c.to, c.data)
    const after = await measure(client, BORROWER, p.market.vToken, p.market.decimals, last!.blockNumber)
    expect(Math.abs(after!.market.supplied - p.predicted.market.supplied)).toBeLessThan(0.01)
    expect(after!.market.supplied - p.before.market.supplied).toBeGreaterThan(99)
  }, 180_000)

  it('refuses another owner\'s position', async () => {
    const p = await plan({ client, user: WHALE, intent: { action: 'repay', targetHf: 1.5, market: null, agentHf: null, agentRepayUsd: null, account: BORROWER, atBlock: null }, positionAccount: BORROWER })
    expect(p).toMatchObject({ ok: false, code: 'not_owner' })
  })
  it('refuses when the wallet holds none of the token', async () => {
    const empty = '0x000000000000000000000000000000000000bEEF' as Address
    const p = await plan({ client, user: empty, intent: { action: 'supply', asset: 'USDT', sizeUsd: 10, atBlock: null } })
    expect(p).toMatchObject({ ok: false, code: 'no_balance' })
  })
  it('refuses a market outside the allowlist', async () => {
    for (const asset of ['BNB', 'NOTAMARKET']) expect(await plan({ client, user: BORROWER, intent: { action: 'supply', asset, sizeUsd: 1, atBlock: null } })).toMatchObject({ ok: false, code: 'not_allowed' })
  })
  it('refuses a repay when there is no borrow', async () => {
    const p = await plan({ client, user: WHALE, intent: { action: 'repay', targetHf: 1.5, market: null, agentHf: null, agentRepayUsd: null, account: WHALE, atBlock: null }, positionAccount: WHALE })
    expect(p.ok).toBe(false)
    expect(['no_position', 'already_met']).toContain((p as { code: string }).code)
  })
  it('shows both numbers for a stale answer', async () => {
    const p = await plan({ client, user: BORROWER, intent: { action: 'repay', targetHf: 2.5, market: 'USDT', agentHf: 1.0, agentRepayUsd: 1, account: BORROWER, atBlock: PINNED - 100_000n }, positionAccount: BORROWER })
    expect(p.ok).toBe(true)
    if (p.ok) { expect(p.stale?.reason).toMatch(/more than 30 minutes ago/); expect(p.stale?.agentSays).toBe('$1.00') }
  }, 120_000)
  it('refuses when the simulation reverts', async () => {
    // A client whose simulation fails stands in for a market that reverts at this block.
    const broken = { ...client, simulateCalls: async () => { throw new Error('execution reverted: market paused') } } as unknown as PublicClient
    const p = await plan({ client: broken, user: BORROWER, intent: { action: 'supply', asset: 'USDT', sizeUsd: 1, atBlock: null } })
    expect(p).toMatchObject({ ok: false, code: 'sim_failed' })
    expect((p as { reason: string }).reason).toMatch(/market paused/)
  }, 120_000)
})
