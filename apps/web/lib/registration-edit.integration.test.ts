import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { network } from '@marque/commerce'

const m = vi.hoisted(() => ({ uri: '' }))
vi.mock('@marque/commerce', async (original) => ({
  ...await original<object>(),
  chainClient: () => ({ getBlockNumber: async () => 123n, readContract: async () => m.uri }),
}))
import { reindexRegistration } from './registration-edit'

const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const tokenId = `${Date.now()}71`
const registry = network(97).identityRegistry
const agentId = `97:${registry.toLowerCase()}:${tokenId}`
const endpoint = 'https://example.org/updated/a2a'
const metadata = { name: 'Updated registration', description: '', image: '', services: [{ name: 'A2A', endpoint }], extension: { retained: true } }
const rows = (v: unknown) => v as Array<Record<string, unknown>>

describe.skipIf(!enabled)('registration editing with guarded PostgreSQL', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = url
    m.uri = `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`
    await db().execute(sql`insert into agent (id, chain_id, token_id, contract_address, owner_address, name, description)
      values (${agentId}, 97, ${tokenId}, ${registry}, '0x1111111111111111111111111111111111111111', 'Old name', 'Old description')`)
    const [service] = rows(await db().execute(sql`insert into agent_service (agent_id, kind, endpoint, source, currently_declared)
      values (${agentId}, 'a2a', 'https://example.org/old/a2a', 'top_level', true) returning id`))
    await db().execute(sql`insert into probe (agent_id, service_id, ok, liveness, latency_ms)
      values (${agentId}, ${Number(service!['id'])}, true, 'live', 1)`)
  })
  afterAll(async () => { await closeDb() })
  it('refreshes changed and cleared fields and service declarations without rewriting observations', async () => {
    expect(await reindexRegistration(97, tokenId)).toEqual({ name: metadata.name })
    const [agent] = rows(await db().execute(sql`select name, description, raw_metadata from agent where id = ${agentId}`))
    expect(agent!['name']).toBe(metadata.name)
    expect(agent!['description']).toBeNull()
    expect((agent!['raw_metadata'] as Record<string, unknown>)['offchain_content']).toEqual(metadata)
    const services = rows(await db().execute(sql`select endpoint, currently_declared from agent_service where agent_id = ${agentId}`))
    expect(services).toContainEqual({ endpoint, currently_declared: true })
    expect(services).toContainEqual({ endpoint: 'https://example.org/old/a2a', currently_declared: false })
    const observations = rows(await db().execute(sql`select ok, liveness, latency_ms from probe where agent_id = ${agentId}`))
    expect(observations).toEqual([{ ok: true, liveness: 'live', latency_ms: 1 }])
  })
})
