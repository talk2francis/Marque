import { describe, expect, it } from 'vitest'
import { foldNetworks, type MarketRow } from './marketplace'

const row = (agentId: string, name: string, owner: string | null, state = 'hireable'): MarketRow =>
  ({ agentId, name, owner, price: '0.05 U', commerce: { state } } as unknown as MarketRow)

describe('foldNetworks', () => {
  it('merges an agent on both networks into one row and keeps testnet-only agents', () => {
    const out = foldNetworks([
      row('56:r:341556', 'Keel', '0xDF10'), row('56:r:344123', 'Mandate Guard-1', '0x8176'), row('56:r:367904', 'Vitals', '0x15a9'),
      row('97:r:2238', 'Keel', '0xdf10'), row('97:r:2591', 'Mandate Guard-1', '0x8176', 'quoteable'), row('97:r:2647', 'Halong Yield', '0x97ff'),
      row('97:r:9999', 'Vitals', '0xOTHER'),
    ])
    expect(out.map((r) => r.agentId)).toEqual(['56:r:341556', '56:r:344123', '56:r:367904', '97:r:2647', '97:r:9999'])
    expect(out[0]!.networks).toEqual([56, 97])
    expect(out[0]!.twin).toMatchObject({ agentId: '97:r:2238', chainId: 97, hireable: true })
    expect(out[1]!.twin?.hireable).toBe(false)
    expect(out[2]!.networks).toEqual([56])
    // Same name, different owner: a different agent, never merged.
    expect(out[4]!.networks).toEqual([97])
  })
})
