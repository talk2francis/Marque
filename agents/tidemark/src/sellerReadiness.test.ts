import { expect, it, vi } from 'vitest'
vi.mock('@bnbagent/sdk/erc8183', () => ({ ERC8183JobOps: {} }))
vi.mock('@bnbagent/studio-runtime/erc8183', () => ({ SubmitPermanentlyUnsupportedError: class extends Error {} }))
vi.mock('@bnbagent/studio-runtime/wallet', () => ({ getWallet: () => { throw Error('Unexpected wallet access') } }))
vi.mock('./signing.js', () => ({}))
vi.mock('./requestLimits.js', () => ({ limitCommerceOperation: async () => {} }))
import { engineRunWork, type Engine } from '@marque/agent-engines'
import { SellerCore, type SellerCoreOpts } from './sellerCore.js'

class TestSeller extends SellerCore { deliver(id: number) { return this.doWorkAndSubmit(id) } }
function fixture(beforeQuote: () => Promise<void>, runWork: SellerCoreOpts['runWork'] = async () => { throw Error('Unexpected paid work') }) {
  const signQuote = vi.fn(async () => ({ accepted: true }))
  const listPrice = vi.fn(() => 10n), clampPrice = vi.fn((price: bigint) => price)
  const verifySignedJob = vi.fn(async () => ({ ok: false, permanent: true, reason: 'synthetic verification rejection' }))
  const jobSpec = vi.fn(async () => ({ task: 'synthetic task', terms: {} }))
  const submitResult = vi.fn(async () => ({ submitTx: 'synthetic-tx', deliverableUrl: null }))
  const signing = { signQuote, listPrice, clampPrice, verifySignedJob, jobSpec, submitResult } as unknown as NonNullable<SellerCoreOpts['signing']>
  const core = new TestSeller({ runWork, generator: 'synthetic', beforeQuote, signing, pendingJobs: async () => ({ jobs: [] }) })
  return { core, signQuote, listPrice, clampPrice, verifySignedJob, submitResult }
}
it('refuses a new quote before pricing or signing when historical reads fail', async () => {
  const f = fixture(async () => { throw Error('Historical observations unavailable') })
  await expect(f.core.negotiate({ task_description: 'synthetic' })).rejects.toThrow('Historical observations unavailable')
  expect(f.signQuote).not.toHaveBeenCalled(); expect(f.listPrice).not.toHaveBeenCalled(); expect(f.clampPrice).not.toHaveBeenCalled()
})
it('preserves exact request and deterministic pricing after readiness succeeds', async () => {
  const ready = vi.fn(async () => {}), f = fixture(ready), request = { task_description: 'synthetic', terms: { price: '10' } }
  expect(await f.core.negotiate({ request })).toEqual({ accepted: true })
  expect(ready).toHaveBeenCalledTimes(1); expect(f.signQuote).toHaveBeenCalledWith(request, 10n)
})
it('does not gate already-funded job verification on new-quote readiness', async () => {
  const ready = vi.fn(async () => { throw Error('archive unavailable') }), f = fixture(ready)
  expect(await f.core.notifyFunded({ job_id: 123 })).toMatchObject({ status: 'rejected', reason: 'synthetic verification rejection' })
  expect(f.verifySignedJob).toHaveBeenCalledWith(123); expect(ready).not.toHaveBeenCalled(); expect(f.signQuote).not.toHaveBeenCalled()
})

it('never reaches transaction submission when the actual paid adapter returns an engine error', async () => {
  const engine: Engine = { meta: { id: 'synthetic', name: 'Synthetic', category: 'yield', testId: null, description: '', priceUsd: 0, skills: [] }, inspect: () => ({ missing: [], assumptions: [] }), run: async () => ({ error: 'fetch failed' }) }
  const f = fixture(async () => {}, engineRunWork(engine, { attempts: 1 }))
  await expect(f.core.deliver(123)).rejects.toThrow('No result was submitted')
  expect(f.submitResult).not.toHaveBeenCalled()
})
it('preserves successful deliverable submission through the existing adapter', async () => {
  const f = fixture(async () => {}, async () => JSON.stringify({ recommend: false, realisedAprPct: 0 }))
  expect(await f.core.deliver(123)).toMatchObject({ ok: true, tx_hash: 'synthetic-tx' })
  expect(f.submitResult).toHaveBeenCalledWith(123, JSON.stringify({ recommend: false, realisedAprPct: 0 }), expect.any(Object))
})
