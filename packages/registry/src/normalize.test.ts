import { describe, it, expect } from 'vitest'
import { extractServices, resolveTemplate, isTemplate, normalizeKind, parseCodes } from './normalize.js'
import type { ScanAgentDetail } from './scan-client.js'

function detail(over: Partial<ScanAgentDetail>): ScanAgentDetail {
  return {
    agent_id: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:318810',
    token_id: '318810',
    chain_id: 56,
    contract_address: '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432',
    ...over,
  } as ScanAgentDetail
}

describe('normalizeKind', () => {
  it('maps known aliases and rejects unknown ones', () => {
    expect(normalizeKind('A2A')).toBe('a2a')
    expect(normalizeKind('mcp-server')).toBe('mcp')
    expect(normalizeKind('B402')).toBe('x402')
    expect(normalizeKind('aacp-platform')).toBe('termix')
    expect(normalizeKind('carrier-pigeon')).toBeNull()
    expect(normalizeKind(null)).toBeNull()
  })
})

describe('template endpoints (AGENTS.md gotcha 9)', () => {
  it('detects a placeholder', () => {
    expect(isTemplate('https://x.dev/api/v1/a2a/agents/{agentId}/card')).toBe(true)
    expect(isTemplate('https://x.dev/api/v1/card')).toBe(false)
  })

  it('substitutes known vars', () => {
    expect(
      resolveTemplate('https://x.dev/a2a/{agentId}/card', { agentId: '56:0xabc:1' }),
    ).toBe('https://x.dev/a2a/56:0xabc:1/card')
  })

  it('returns null rather than fetching a literal placeholder', () => {
    expect(resolveTemplate('https://x.dev/a2a/{mysteryKey}/card', { agentId: 'a' })).toBeNull()
  })
})

describe('extractServices', () => {
  it('parses the top-level services object', () => {
    const out = extractServices(detail({
      services: { a2a: { endpoint: 'https://api.example.com/card', version: '0.3.0' } },
    }))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'a2a', endpoint: 'https://api.example.com/card', version: '0.3.0', source: 'top_level' })
  })

  it('parses the offchain services array', () => {
    const out = extractServices(detail({
      raw_metadata: {
        offchain_content: {
          services: [{ name: 'MCP', endpoint: 'https://api.example.com/mcp', version: '1.0', price: '0.10' }],
        },
      },
    }))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'mcp', source: 'offchain_array', declaredPrice: '0.10' })
  })

  it('prefers the richer offchain array when both describe the same endpoint', () => {
    // The two sources disagree; the array carries version and price, so it wins.
    const out = extractServices(detail({
      services: { a2a: { endpoint: 'https://api.example.com/card' } },
      raw_metadata: {
        offchain_content: {
          services: [{ name: 'A2A', endpoint: 'https://api.example.com/card', version: '0.3.0', price: '0.15' }],
        },
      },
    }))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ source: 'offchain_array', version: '0.3.0', declaredPrice: '0.15' })
  })

  it('unions services that genuinely differ between the two sources', () => {
    const out = extractServices(detail({
      services: { a2a: { endpoint: 'https://a.example.com/card' } },
      raw_metadata: { offchain_content: { services: [{ name: 'MCP', endpoint: 'https://b.example.com/mcp' }] } },
    }))
    expect(out).toHaveLength(2)
    expect(new Set(out.map((s) => s.kind))).toEqual(new Set(['a2a', 'mcp']))
  })

  it('resolves a TermiX-shaped template against the agent id', () => {
    const out = extractServices(detail({
      services: {
        a2a: {
          endpoint: 'https://platform-backend.prod.termix.live/api/v1/a2a/agents/{agentId}/card',
          version: '0.3.0',
        },
      },
    }))
    expect(out[0]?.isTemplate).toBe(true)
    expect(out[0]?.resolvedEndpoint).toBe(
      'https://platform-backend.prod.termix.live/api/v1/a2a/agents/56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:318810/card',
    )
  })

  it('returns nothing for an agent with no services, rather than inventing one', () => {
    expect(extractServices(detail({ services: null, raw_metadata: null }))).toHaveLength(0)
  })

  it('ignores service entries with no endpoint', () => {
    const out = extractServices(detail({ services: { a2a: { version: '0.3.0' } } }))
    expect(out).toHaveLength(0)
  })
})

describe('parseCodes', () => {
  it('collects 8004scan parse codes for the graveyard view', () => {
    const codes = parseCodes(detail({
      parse_status: { status: 'partial', errors: [{ code: 'IA002' }], warnings: ['IA010'], info: [] },
    }))
    expect(codes).toEqual(expect.arrayContaining(['IA002', 'IA010']))
  })

  it('is empty for a clean parse', () => {
    expect(parseCodes(detail({ parse_status: { status: 'success', errors: [], warnings: [], info: [] } }))).toEqual([])
  })
})
