import { describe, expect, it } from 'vitest'
import type { Engine } from '@marque/agent-engines'
import { publicReadEngine } from './publicReadEngine.js'

const fake = (run: Engine['run']): Engine => ({ meta: { id: 'tidemark', name: 'Tidemark', category: 'yield', testId: null, description: '', priceUsd: 0, skills: [] }, inspect: () => ({ missing: [], assumptions: [] }), run })

describe('public realised-yield read failures', () => {
  it('removes a credential URL from a returned upstream failure', async () => {
    const engine = publicReadEngine(fake(async () => ({ error: 'HTTP request failed. URL: https://archive.invalid/private-token' })))
    expect(JSON.stringify(await engine.run('read only'))).not.toMatch(/archive\.invalid|private-token|https:/)
  })
  it('removes nested venue failure URLs while preserving real measurements', async () => {
    const result = await publicReadEngine(fake(async () => ({ netRealisedAprPct: 1.25, window: { fromBlock: '123', toBlock: '456' }, excluded: [{ venue: 'Venus USDT', reason: 'failed wss://archive.invalid/private-token' }] }))).run('read only')
    expect(result).toMatchObject({ netRealisedAprPct: 1.25, window: { fromBlock: '123', toBlock: '456' } })
    expect(JSON.stringify(result)).not.toContain('private-token')
  })
  it('keeps task refusals and successful answer bytes unchanged', async () => {
    for (const answer of [{ error: 'the task does not state the amount to deploy' }, { recommend: false, venue: null, realisedAprPct: 0, source: 'archived eth_call at blocks 123 and 456' }]) {
      expect(await publicReadEngine(fake(async () => answer)).run('read only')).toEqual(answer)
    }
  })
  it('returns a plain failure when the engine throws, without reviving an old value', async () => {
    const result = await publicReadEngine(fake(async () => { throw Error('https://archive.invalid/private-token') })).run('read only')
    expect(result).toEqual({ error: 'Could not read chain observations. Retry after a short pause.' })
  })
})
