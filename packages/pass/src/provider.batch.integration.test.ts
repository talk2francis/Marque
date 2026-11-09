import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPublicClient, http, numberToHex, parseEther, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import { createPassProvider, type ConfirmRequest } from './provider'

/**
 * wallet_sendCalls against a real node: anvil started as chain 97, so the provider signs exactly as it does on BSC
 * testnet. Skipped when anvil is not installed.
 */
const HAS_ANVIL = spawnSync('anvil', ['--version']).status === 0
const PORT = 18_597
const RPC = `http://127.0.0.1:${PORT}`
// anvil's first default account: a public test key with no value anywhere.
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex
const account = privateKeyToAccount(KEY)
const A = '0x1111111111111111111111111111111111111111' as Hex
const B = '0x2222222222222222222222222222222222222222' as Hex

let node: ChildProcess | null = null
const pub = createPublicClient({ chain: bscTestnet, transport: http(RPC) })

describe.skipIf(!HAS_ANVIL)('Marque Pass wallet_sendCalls', () => {
  beforeAll(async () => {
    node = spawn('anvil', ['--chain-id', '97', '--port', String(PORT), '--silent'], { stdio: 'ignore' })
    for (let i = 0; i < 50; i++) {
      try { await pub.getBlockNumber(); return } catch { await new Promise((r) => setTimeout(r, 100)) }
    }
    throw new Error('anvil did not start')
  })
  afterAll(() => { if (node?.pid) process.kill(node.pid) })

  const make = (onConfirm: (r: ConfirmRequest) => void = () => undefined) => createPassProvider({
    address: () => account.address,
    confirm: async (r) => { onConfirm(r); return account },
    rpc: { 97: RPC },
  })

  it('shows every step in one confirmation, sends in order and reports 200 with both receipts', async () => {
    const seen: ConfirmRequest[] = []
    const p = make((r) => seen.push(r))
    const before = await pub.getBalance({ address: B })
    const { id } = await p.request({ method: 'wallet_sendCalls', params: [{ version: '2.0.0', chainId: numberToHex(97), from: account.address, atomicRequired: false, calls: [{ to: A, value: numberToHex(parseEther('1')) }, { to: B, value: numberToHex(parseEther('2')) }] }] }) as { id: Hex }
    expect(seen).toHaveLength(1)
    expect(seen[0]!.kind).toBe('calls')
    expect(seen[0]!.kind === 'calls' && seen[0]!.calls.map((c) => c.to)).toEqual([A, B])
    let status: { status: number; receipts: Array<{ status: string; transactionHash: Hex }> } | null = null
    for (let i = 0; i < 50; i++) {
      status = await p.request({ method: 'wallet_getCallsStatus', params: [id] }) as typeof status
      if (status!.status !== 100) break
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(status!.status).toBe(200)
    expect(status!.receipts).toHaveLength(2)
    expect(status!.receipts.every((r) => r.status === '0x1')).toBe(true)
    expect(await pub.getBalance({ address: B }) - before).toBe(parseEther('2'))
  })

  it('refuses an atomic batch, a foreign chain and an unknown batch id, signing nothing', async () => {
    let asked = 0
    const p = make(() => { asked += 1 })
    await expect(p.request({ method: 'wallet_sendCalls', params: [{ chainId: numberToHex(97), atomicRequired: true, calls: [{ to: A }] }] })).rejects.toMatchObject({ code: 5760 })
    await expect(p.request({ method: 'wallet_sendCalls', params: [{ chainId: numberToHex(56), calls: [{ to: A }] }] })).rejects.toMatchObject({ code: 5710 })
    await expect(p.request({ method: 'wallet_sendCalls', params: [{ calls: [] }] })).rejects.toMatchObject({ code: -32602 })
    await expect(p.request({ method: 'wallet_getCallsStatus', params: ['0x01'] })).rejects.toMatchObject({ code: 5730 })
    expect(asked).toBe(0)
  })

  it('surfaces a first call that would revert before asking for any confirmation', async () => {
    let asked = 0
    const p = make(() => { asked += 1 })
    // Calling a non-payable precompile with value reverts on estimation; a value above the balance does too.
    await expect(p.request({ method: 'wallet_sendCalls', params: [{ calls: [{ to: A, value: numberToHex(parseEther('100000000')) }] }] })).rejects.toBeTruthy()
    expect(asked).toBe(0)
  })

  it('reports its batch ability per chain', async () => {
    expect(await make().request({ method: 'wallet_getCapabilities', params: [account.address] })).toEqual({ '0x61': { atomic: { status: 'unsupported' } } })
  })
})
