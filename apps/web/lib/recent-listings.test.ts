import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { byBuilder } from './recent-listings'

describe('recently listed: one card per builder (26 Nov 2026)', () => {
  it('collapses a family of agents to its newest, counting the rest, and keeps distinct builders apart', () => {
    const out = byBuilder([
      { name: 'Brain on BNB — DeFi Agent', owner: '0xA', at: 1 },
      { name: 'Brain on BNB — Venus Yield Ranking', owner: '0xB', at: 5 },
      { name: 'Brain on BNB — BSC Grid Planner', owner: '0xA', at: 2 },
      { name: 'Ruby', owner: '0xC', at: 9 },
      { name: 'Spartans', owner: '0xD', at: 3 },
      { name: 'VEYRA Keeper', owner: '0xE', at: 4 },
    ])
    expect(out.map((x) => [x.name, x.more])).toEqual([['Ruby', 0], ['Brain on BNB — Venus Yield Ranking', 2], ['VEYRA Keeper', 0], ['Spartans', 0]])
  })
  it('groups unnamed families by owner wallet', () => {
    const out = byBuilder([{ name: 'Alpha', owner: '0xAA', at: 1 }, { name: 'Beta', owner: '0xaa', at: 2 }])
    expect(out).toEqual([{ name: 'Beta', owner: '0xaa', at: 2, more: 1 }])
  })
})
