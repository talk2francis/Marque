import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { agentBrand } from './agent-brand'
import { REFERENCE_AGENTS } from './reference-agents'

describe('agentBrand', () => {
  it('resolves every reference agent to its own avatar and hero', () => {
    for (const a of REFERENCE_AGENTS) {
      const b = agentBrand(a.id)
      expect(b?.slug).toBe(a.slug)
      expect(b?.avatar).toBe(`/brand/agents/${a.slug}/avatar.webp`)
      expect(b?.avatarSmall).toBe(`/brand/agents/${a.slug}/avatar-160.webp`)
      expect(b?.heroDay).toBe(`/brand/agents/${a.slug}/hero-day.webp`)
      expect(b?.heroDaySmall).toBe(`/brand/agents/${a.slug}/hero-day-900.webp`)
      expect(b?.heroNight).toBe(`/brand/agents/${a.slug}/hero-night.webp`)
      expect(b?.heroNightSmall).toBe(`/brand/agents/${a.slug}/hero-night-900.webp`)
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

  it('points every derivative at a file the pipeline generated', () => {
    for (const a of REFERENCE_AGENTS) {
      const b = agentBrand(a.id)!
      for (const f of [b.avatar, b.avatarSmall, b.heroDay, b.heroDaySmall, b.heroNight, b.heroNightSmall]) {
        expect(existsSync(join(__dirname, '..', 'public', f)), f).toBe(true)
      }
    }
  })

  it('has six distinct identities', () => {
    const b = REFERENCE_AGENTS.map((a) => agentBrand(a.id)!)
    expect(new Set(b.map((x) => x.avatar)).size).toBe(6)
    expect(new Set(b.map((x) => x.heroDay)).size).toBe(6)
    expect(new Set(b.map((x) => x.heroNight)).size).toBe(6)
    expect(new Set(b.map((x) => x.tone)).size).toBe(6)
  })
})
