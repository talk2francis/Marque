import { describe, expect, it } from 'vitest'
import { attributeDescription, shortlistDomain, statusName, CAMPAIGN } from './campaign.js'
import { cardVerdict } from './campaign-quest.js'

describe('shortlistDomain', () => {
  it('reduces hosts, URLs and aliases to a shortlisted domain', () => {
    expect(shortlistDomain('marque.trade')).toBe('marque.trade')
    expect(shortlistDomain('https://www.mandatemarkets.com/jobs/1')).toBe('mandatemarkets.com')
    expect(shortlistDomain('app.hellofugu.xyz')).toBe('hellofugu.xyz')
    expect(shortlistDomain('agent.family')).toBe('termix.ai')
    expect(shortlistDomain('platform-backend.prod.termix.live')).toBe('termix.ai')
    expect(shortlistDomain('POKTER.XYZ.')).toBe('pokter.xyz')
  })
  it('never credits a domain that is not on the shortlist, or one that only contains a shortlisted name', () => {
    expect(shortlistDomain('example.com')).toBeNull()
    expect(shortlistDomain('notmarque.trade')).toBeNull()
    expect(shortlistDomain('marque.trade.evil.io')).toBeNull()
    expect(shortlistDomain('')).toBeNull()
    expect(shortlistDomain(null)).toBeNull()
  })
})

describe('attributeDescription (the published order)', () => {
  it('1. Marque intent record wins over everything', () => {
    expect(attributeDescription('{"task":"x via pokter.xyz"}', { marqueIntent: true })).toMatchObject({ marketplace: 'marque.trade', attribution: 'marque_intent' })
  })
  it('2. client_ref in the description JSON', () => {
    const d = JSON.stringify({ chain_id: 56, client_ref: 'marque.trade', marque_intent: 'fda2', task: 'What is the health factor (via marque.trade)' })
    expect(attributeDescription(d)).toEqual({ marketplace: 'marque.trade', attribution: 'client_ref', clientRef: 'marque.trade' })
  })
  it('an unknown client_ref is kept but credits no one, and the task suffix is still read', () => {
    const d = JSON.stringify({ client_ref: 'example.com', task: 'rank yields (via hellofugu.xyz)' })
    expect(attributeDescription(d)).toEqual({ marketplace: 'hellofugu.xyz', attribution: 'via_suffix', clientRef: 'example.com' })
  })
  it('3. a trailing "via <domain>" in the task of a signed SDK envelope', () => {
    const d = JSON.stringify({ chain_id: 56, negotiation_hash: '0x1', provider_sig: '0x2', task: 'Check my HF (via marque.trade)', terms: {} })
    expect(attributeDescription(d)).toMatchObject({ marketplace: 'marque.trade', attribution: 'via_suffix' })
    expect(attributeDescription(JSON.stringify({ task: 'risk-adjusted BSC yield analysis, via mandatemarkets.com' }))).toMatchObject({ marketplace: 'mandatemarkets.com', attribution: 'via_suffix' })
  })
  it('3. the leading form used in plain text, and a task nested as a JSON string', () => {
    expect(attributeDescription('via mandatemarkets.com: Mandate Range-1 (ERC-8004 #344119) for 7546488')).toMatchObject({ marketplace: 'mandatemarkets.com', attribution: 'via_suffix' })
    const nested = JSON.stringify({ protocol: 'other', task: JSON.stringify({ task: 'Read my HF (via marque.trade)' }) })
    expect(attributeDescription(nested)).toMatchObject({ marketplace: 'marque.trade' })
  })
  it('"via" in the middle of a sentence does not count', () => {
    expect(attributeDescription('Swap via pokter.xyz routing then report back to me')).toMatchObject({ marketplace: null })
  })
  it('4. known envelopes: Pokter jobs and checks, a "via" field', () => {
    expect(attributeDescription(JSON.stringify({ protocol: 'pokter-job', version: 1, identity: { chainId: 97, tokenId: '2618' }, task: 'x' }))).toMatchObject({ marketplace: 'pokter.xyz', attribution: 'envelope' })
    expect(attributeDescription(JSON.stringify({ task: 'x', requested_by: 'Pokter' }))).toMatchObject({ marketplace: 'pokter.xyz', attribution: 'envelope' })
    expect(attributeDescription(JSON.stringify({ task: 'Brain on BNB monitor', via: 'mandatemarkets.com' }))).toMatchObject({ marketplace: 'mandatemarkets.com', attribution: 'envelope' })
  })
  it('5. anything else is Not recorded', () => {
    expect(attributeDescription('guard my TSLA loan 2026-10-09T15:14:12Z')).toEqual({ marketplace: null, attribution: null, clientRef: null })
    expect(attributeDescription('{"legs":["COST"],"proposer":{"agent":"keel-scout"}}')).toMatchObject({ marketplace: null })
    expect(attributeDescription('{not json')).toMatchObject({ marketplace: null })
  })
})

describe('campaign constants', () => {
  it('uses the organizer window, 1 Oct 12:00 UTC to 5 Nov 12:00 UTC', () => {
    expect(CAMPAIGN.start).toBe('2026-10-01T12:00:00Z')
    expect(CAMPAIGN.end).toBe('2026-11-05T12:00:00Z')
    expect(statusName(1)).toBe('FUNDED')
    expect(statusName(9)).toBe('STATUS_9')
  })
})

describe('cardVerdict', () => {
  const good = JSON.stringify({ name: 'Keel', description: 'Venus health factor plans', url: 'https://marque.trade/agents/keel/a2a', skills: [{ id: 'hf' }] })
  it('accepts a complete card on a real domain', () => {
    expect(cardVerdict('https://marque.trade/agents/keel/.well-known/agent-card.json', good)).toMatchObject({ ok: true, name: 'Keel' })
  })
  it('names every missing part of an unbound envelope (the #377436 case)', () => {
    const v = cardVerdict('https://platform-backend.prod.termix.live/a/377436', JSON.stringify({ status: 'UNBOUND', presence: 'offline', card: { name: 'majesticfranc.agent' } }))
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('Returned JSON, but not a valid A2A card: it says status UNBOUND, it says it is offline, it does not say what the agent does, it names no endpoint to call, it lists no skills.')
  })
  it('refuses raw IPs, shared platform hosts and non-JSON', () => {
    expect(cardVerdict('http://203.0.113.9:8080/card', good).reason).toMatch(/raw IP/)
    expect(cardVerdict('https://my-agent.vercel.app/card', good).reason).toMatch(/vercel\.app/)
    expect(cardVerdict('https://agent.example.com/card', '<html>').reason).toBe('The card address did not return JSON.')
    expect(cardVerdict('https://agent.example.com/card', '[1]').ok).toBe(false)
  })
})

import { withAttribution, buildPlainDescription } from './description.js'

describe('attribution signals on Marque hires (invariant 36)', () => {
  it('adds the suffix once, to the end of the task', () => {
    expect(withAttribution('What is the HF of 0xabc')).toBe('What is the HF of 0xabc (via marque.trade)')
    expect(withAttribution('What is the HF of 0xabc (via marque.trade)  ')).toBe('What is the HF of 0xabc (via marque.trade)')
  })
  it('a plain description carries both client_ref and the suffix, and attributes to Marque on its own', () => {
    const d = buildPlainDescription({ price: '1', payment_token: '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565', provider: '0xdF1074a272C53A1a10b96Fa0201Eb58bbbaaFe00', chain_id: 97, verifying_contract: '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE', service: 'hf' } as never, 'Check HF', 'intent-1')
    const j = JSON.parse(d) as { task: string; client_ref: string }
    expect(j.client_ref).toBe('marque.trade')
    expect(j.task).toBe('Check HF (via marque.trade)')
    expect(attributeDescription(d)).toMatchObject({ marketplace: 'marque.trade', attribution: 'client_ref' })
  })
  it('a signed envelope with only the suffix still attributes to Marque', () => {
    const d = JSON.stringify({ chain_id: 97, negotiation_hash: '0x1', provider_sig: '0x2', task: withAttribution('Check HF'), terms: {} })
    expect(attributeDescription(d)).toMatchObject({ marketplace: 'marque.trade', attribution: 'via_suffix' })
  })
})

describe('envelopes credit any shortlisted marketplace symmetrically', () => {
  it('protocol "<name>-job" and requested_by, by name or domain', () => {
    expect(attributeDescription(JSON.stringify({ protocol: 'dolphin-job', task: 'x' }))).toMatchObject({ marketplace: 'dolphinamp.xyz', attribution: 'envelope' })
    expect(attributeDescription(JSON.stringify({ requested_by: 'Agent Atlas', task: 'x' }))).toMatchObject({ marketplace: 'agent-atlas.xyz' })
    expect(attributeDescription(JSON.stringify({ requested_by: 'marque.trade', task: 'x' }))).toMatchObject({ marketplace: 'marque.trade' })
    expect(attributeDescription(JSON.stringify({ protocol: 'ERC-8183', task: 'x' }))).toMatchObject({ marketplace: null })
    expect(attributeDescription(JSON.stringify({ requested_by: 'someone else', task: 'x' }))).toMatchObject({ marketplace: null })
  })
})

describe('attribution suffix and seller JSON tasks', () => {
  it('leaves a JSON task unchanged so the seller can still parse it', () => {
    expect(withAttribution('{"address":"0xabc","target_hf":1.5}')).toBe('{"address":"0xabc","target_hf":1.5}')
    expect(withAttribution('{not json')).toBe('{not json (via marque.trade)')
  })
})
