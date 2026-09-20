import { beforeEach, describe, expect, it, vi } from 'vitest'
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@marque/db', () => ({ db: () => ({ execute }) }))
import { callableAgentById } from './agents'
import { PgDialect } from 'drizzle-orm/pg-core'

describe('explicit charter agent lookup', () => {
  beforeEach(() => { execute.mockReset(); vi.unstubAllEnvs() })
  it('resolves a third-party identity independently of category and the shortlist', async () => {
    execute.mockResolvedValue({ rows: [{ agent_id: '56:registry:999', token_id: '999', name: 'Third party', kind: 'mcp', endpoint: 'https://example.com/mcp', host: 'https://example.com', latency_ms: 100 }] })
    expect(await callableAgentById('56:registry:999')).toMatchObject({ agentId: '56:registry:999', name: 'Third party', isReference: false })
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0])
    expect(query.params).toContain('56:registry:999')
    expect(query.sql).toContain('where agent_id =')
    expect(query.sql).toContain("s.kind in ('a2a', 'mcp')")
    expect(query.sql).toContain('a.chain_id = 56')
    expect(query.sql).not.toContain('agent_category')
    expect(query.sql).toContain('join agent_service s on s.agent_id = a.id')
  })
  it('returns no substitute when an identity has no callable service', async () => {
    execute.mockResolvedValue({ rows: [] })
    expect(await callableAgentById('missing')).toBeNull()
  })
  it('does not invent an endpoint for an unconfigured reference agent', async () => {
    vi.stubEnv('BOUND_PUBLIC_URL', '')
    expect(await callableAgentById('marque:bound')).toBeNull()
    expect(execute).not.toHaveBeenCalled()
  })
  it('uses the configured reference endpoint and canonical name', async () => {
    vi.stubEnv('BOUND_PUBLIC_URL', 'https://example.com/bound/')
    expect(await callableAgentById('marque:bound')).toMatchObject({ name: 'Bound', endpoint: 'https://example.com/bound/.well-known/agent-card.json', isReference: true })
  })
})
