import { describe, expect, it, vi } from 'vitest'
const fetch = vi.hoisted(() => vi.fn())
vi.mock('@marque/probe', async original => ({ ...await original<object>(), safeFetch: fetch }))
import { freeTarget, tryFree } from './try'
import { network } from './config'
const outside = `56:${network(56).identityRegistry.toLowerCase()}:363619`
describe('external preview mutation boundary', () => {
  it('does not invoke outside A2A tasks merely because an endpoint is live', async () => {
    await expect(freeTarget(outside,43279)).rejects.toMatchObject({code:'free_preview_unsupported',status:422})
    await expect(tryFree(outside,'no task must be sent',43279)).rejects.toMatchObject({code:'free_preview_unsupported'})
    expect(fetch).not.toHaveBeenCalled()
  })
})
