import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@marque/db', () => ({ chartersDb: () => mocks }))
beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })
describe('earned charter experience', () => {
  it('counts only a declared executor on its exact identity network', async () => {
    mocks.execute.mockResolvedValue([
      { caller:'0xbe527145766262800dabd795ade6063a85d5f31e', chain_id:56, kind:2, actions:3, last:'2026-11-10T06:00:00Z' },
      { caller:'0xbe527145766262800dabd795ade6063a85d5f31e', chain_id:97, kind:2, actions:7, last:'2026-11-10T06:00:00Z' },
      { caller:'0x0000000000000000000000000000000000000001', chain_id:56, kind:2, actions:999, last:'2026-11-10T06:00:00Z' },
    ])
    const { charterExperience } = await import('./charter-experience')
    const result = await charterExperience()
    expect(result.get('56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341555')).toEqual([{ chainId:56, kind:'yield', actions:3, lastAction:'2026-11-10T06:00:00.000Z' }])
    expect(result.get('97:0x8004a818bfb912233c491871b3d84c89a494bd9e:2237')?.[0]?.actions).toBe(7)
    expect(result.get('56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341556')).toEqual([])
  })
  it('does not turn a failed evidence read into zero execution', async () => {
    mocks.execute.mockRejectedValue(new Error('unavailable'))
    const { charterExperience } = await import('./charter-experience')
    await expect(charterExperience()).rejects.toThrow('unavailable')
    await expect(charterExperience()).rejects.toThrow('unavailable')
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })
})
