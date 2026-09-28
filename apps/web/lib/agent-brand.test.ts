import { describe, expect, it } from 'vitest'
import { agentBrand } from './agent-brand'
import { REFERENCE_AGENTS } from './reference-agents'

describe('agentBrand', () => {
  it('resolves every reference agent to its own avatar and hero', () => {
    for (const a of REFERENCE_AGENTS) {
      const b = agentBrand(a.id)
      expect(b?.slug).toBe(a.slug)
      expect(b?.avatar).toBe(`/brand/agents/${a.slug}/avatar.webp`)
      expect(b?.hero).toBe(`/brand/agents/${a.slug}/hero.webp`)
    }
  })

  it('resolves the canonical ERC-8004 row id and the bare mainnet token', () => {
    expect(agentBrand('56:341556')?.slug).toBe('keel')
    expect(agentBrand('341557')?.slug).toBe('redcell')
    expect(agentBrand('sluicegate')?.slug).toBe('sluicegate')
    expect(agentBrand('marque:tidemark')?.tone).toBe('opal')
  })

  it('never brands a third party, and never matches on a display name', () => {
    expect(agentBrand('56:304493')).toBeNull()
    expect(agentBrand('Keel')).toBeNull()
    expect(agentBrand(null)).toBeNull()
    expect(agentBrand('')).toBeNull()
  })

  it('has six distinct identities', () => {
    const b = REFERENCE_AGENTS.map((a) => agentBrand(a.id)!)
    expect(new Set(b.map((x) => x.avatar)).size).toBe(6)
    expect(new Set(b.map((x) => x.hero)).size).toBe(6)
    expect(new Set(b.map((x) => x.tone)).size).toBe(6)
  })
})
