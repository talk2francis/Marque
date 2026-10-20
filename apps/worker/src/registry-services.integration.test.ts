import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { registryRefreshCandidatesQuery } from './registry-services'
const url = process.env.MARQUE_INTEGRATION_DB
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const id = `56:000-registry-refresh:${Date.now()}`
describe.skipIf(!enabled)('registry refresh selection in guarded PostgreSQL', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    await db().execute(sql`insert into agent (id,chain_id,token_id,contract_address) values (${id},56,${id},'synthetic')`)
  })
  afterAll(async () => { await closeDb() })
  it('binds reference IDs as a typed array rather than a PostgreSQL record', async () => {
    const result = await db().execute(registryRefreshCandidatesQuery([id])) as Array<{ id: string }>
    expect(result.some(a => a.id === id)).toBe(true)
  })
  it('also accepts an empty reference population', async () => {
    const result = await db().execute(registryRefreshCandidatesQuery([])) as Array<{ id: string }>
    expect(result.some(a => a.id === id)).toBe(false)
  })
})
