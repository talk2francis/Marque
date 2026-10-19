import * as React from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { zeroAddress } from 'viem'
import { NETWORKS } from '@marque/commerce/client'
import { JobActions, type JobActionProps } from './JobActions'

const h = vi.hoisted(() => ({ index: 0, states: [] as unknown[], read: vi.fn(), write: vi.fn(), receipt: vi.fn(), toast: vi.fn(), fetch: vi.fn() }))
// Exercise the real button callback and commerce guards without a DOM, wallet,
// network, effects or transaction. Hook state is retained to inspect the outcome.
vi.mock('react', async original => ({ ...await original<object>(), useEffect: () => {}, useState: (initial: unknown) => {
  const index = h.index++
  const value = index === 6 ? Math.floor(Date.now() / 1000) : initial
  h.states[index] = value
  return [value, (next: unknown) => { h.states[index] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(h.states[index]) : next }]
} }))
vi.mock('wagmi', () => ({ useConfig: () => ({}), useAccount: () => ({ address: '0x1111111111111111111111111111111111111111', isConnected: true, chainId: 56 }) }))
vi.mock('@rainbow-me/rainbowkit', () => ({ useConnectModal: () => ({ openConnectModal: vi.fn() }) }))
vi.mock('@wagmi/core', async original => ({ ...await original<object>(), readContract: h.read, writeContract: h.write, waitForTransactionReceipt: h.receipt }))
vi.mock('@marque/commerce/client', async original => ({ ...await original<object>(), useRate: () => ({ state: { phase: 'idle' }, rate: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../../../_components/ui', () => ({ Button: 'button', ButtonLink: 'a', ErrorNote: 'aside', Modal: 'dialog', StarInput: 'input', TxStepper: 'ol' }))
vi.mock('../../../../lib/toast', () => ({ toast: h.toast }))

const now = 1_900_000_000, buyer = '0x1111111111111111111111111111111111111111', provider = '0x2222222222222222222222222222222222222222'
const n = NETWORKS[56], asset = n.assets[0]!
const props = (): JobActionProps => ({ chainId: 56, jobId: '123', state: 'OPEN', client: buyer, agentName: 'Synthetic fixture', agentKey: 'synthetic', priceLabel: '0.00 incorrect display',
  resume: { priceRaw: '10', provider, description: 'synthetic fixture terms', expiredAt: String(now + 7200), token: asset }, fundingDeadline: now + 3600,
  refundFrom: null, reviewEndsAt: null, submitDeadline: null, rated: null })
const job = () => ({ client: buyer, provider, evaluator: n.router, hook: n.router, description: 'synthetic fixture terms', expiredAt: BigInt(now + 7200), budget: 0n, status: 0 })
type Button = React.ReactElement<{ children?: React.ReactNode; onClick?: () => Promise<void> }>
function findButton(node: React.ReactNode, label = 'Finish paying '): Button | null {
  if (Array.isArray(node)) { for (const child of node) { const found = findButton(child, label); if (found) return found }; return null }
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return null
  if (node.type === 'button' && (Array.isArray(node.props.children) ? node.props.children[0] === label : node.props.children === label)) return node as Button
  return findButton(node.props.children, label)
}
function recovery(p = props()) { h.index = 0; return findButton(JobActions(p)) }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now * 1000); vi.stubGlobal('React', React); vi.stubGlobal('fetch', h.fetch)
  h.states = []; h.read.mockReset(); h.write.mockReset(); h.receipt.mockReset(); h.toast.mockReset(); h.fetch.mockReset()
  h.read.mockImplementation(async (_config: unknown, { functionName }: { functionName: string }) => ({ allowance: 0n, getJob: job(), jobPolicy: zeroAddress, jobPaymentToken: asset.address })[functionName])
  h.write.mockResolvedValue(`0x${'1'.repeat(64)}`); h.receipt.mockResolvedValue({ status: 'success' })
  h.fetch.mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Job Room recovery before any wallet write', () => {
  it('hides payment after the window closes and keeps cancellation available', () => {
    h.index = 0
    const tree = JobActions({ ...props(), fundingDeadline: now })
    expect(findButton(tree)).toBeNull()
    expect(findButton(tree, 'Cancel job')).not.toBeNull()
    expect(h.write).not.toHaveBeenCalled()
  })
  it('rechecks time at click even when the page was rendered before expiry', async () => {
    const button = recovery()!
    vi.setSystemTime((now + 3601) * 1000)
    await button.props.onClick!()
    expect(h.read).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled()
    expect(h.states[3]).toMatchObject({ code: 'job_payment_window_closed' })
  })
  it.each(['client', 'provider', 'evaluator', 'hook', 'description', 'expiredAt', 'budget', 'status', 'jobPolicy', 'jobPaymentToken'])('refuses changed current chain evidence: %s', async field => {
    const changed: Record<string, unknown> = { ...job(), [field]: field === 'expiredAt' ? BigInt(now + 7201) : field === 'budget' ? 11n : field === 'status' ? 4 : 'changed' }
    h.read.mockImplementation(async (_config: unknown, { functionName }: { functionName: string }) => functionName === 'getJob' ? changed : functionName === field ? '0x3333333333333333333333333333333333333333' : functionName === 'allowance' ? 0n : functionName === 'jobPolicy' ? zeroAddress : asset.address)
    await recovery()!.props.onClick!()
    expect(h.read).toHaveBeenCalledTimes(4); expect(h.write).not.toHaveBeenCalled(); expect(h.fetch).not.toHaveBeenCalled(); expect(h.toast).not.toHaveBeenCalled()
  })
  it('stops when a fresh chain read is unavailable without exposing its raw error', async () => {
    h.read.mockRejectedValue(new Error('private rpc transport credential'))
    await recovery()!.props.onClick!()
    expect(h.write).not.toHaveBeenCalled()
    expect(JSON.stringify(h.states[3])).not.toMatch(/private|credential|Nothing was charged/)
  })
  it('preserves exact approval and existing payment order for a matching open job', async () => {
    await recovery()!.props.onClick!()
    expect(h.write.mock.calls.map(([, call]) => call.functionName)).toEqual(['registerJob', 'setBudget', 'approve', 'fund'])
    expect(h.write.mock.calls[2]![1].args).toEqual([n.commerce, 10n])
    expect(h.write.mock.calls[3]![1].args).toEqual([123n, 10n, '0x'])
    expect(h.states[4]).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'fund', label: expect.not.stringContaining('incorrect display') })]))
    expect(h.toast.mock.calls[0]![0].body).toContain('accepted the notification')
  })
  it('does not repay a job already funded while the page was open', async () => {
    h.read.mockImplementation(async (_config: unknown, { functionName }: { functionName: string }) => functionName === 'getJob' ? { ...job(), status: 1, budget: 10n } : functionName === 'allowance' ? 10n : functionName === 'jobPolicy' ? n.policy : asset.address)
    await recovery()!.props.onClick!()
    expect(h.write).not.toHaveBeenCalled(); expect(h.fetch).toHaveBeenCalledOnce()
  })
  it('keeps a failed seller notification separate from successful escrow funding', async () => {
    h.fetch.mockResolvedValue({ ok: false })
    await recovery()!.props.onClick!()
    expect(h.write).toHaveBeenCalledTimes(4)
    expect(h.states[4]).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'notify', state: 'failed' })]))
    expect(h.toast.mock.calls[0]![0].body).toContain('notification is pending')
    expect(h.toast.mock.calls[0]![0].body).not.toContain('accepted')
  })
  it('stops before approval or funding when time expires after an earlier step', async () => {
    h.write.mockImplementation(async () => { vi.setSystemTime((now + 3601) * 1000); return `0x${'1'.repeat(64)}` })
    await recovery()!.props.onClick!()
    expect(h.write.mock.calls.map(([, call]) => call.functionName)).toEqual(['registerJob'])
    expect(h.fetch).not.toHaveBeenCalled()
    expect(h.states[3]).toMatchObject({ code: 'job_payment_window_closed' })
  })
})
