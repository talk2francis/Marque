import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { marketplaceSourceQuery, marketplaceCategoryQuery } from './marketplace'
const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const stamp = Date.now()
const owner = `0x${stamp.toString(16).padStart(40, '0')}`
const other = `0x${(stamp + 1).toString(16).padStart(40, '0')}`
const ids = Array.from({ length: 8 }, (_, i) => `56:catalog-scope:${stamp + i}`)
const asRows = (r: unknown) => r as Array<Record<string, unknown>>
describe.skipIf(!enabled)('catalog owner partition, real isolated PostgreSQL', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = url
    for (const [i, id] of ids.entries()) {
      await db().execute(sql`insert into agent(id,chain_id,contract_address,token_id,name,owner_address,raw_metadata) values(${id},${i === 6 ? 97 : 56},'0x0000000000000000000000000000000000000001',${String(stamp + i)},${`fixture ${i}`},${i === 4 ? other : owner},${JSON.stringify({ offchain_content: { image: 'https://8004scan.io/scope.png' } })}::jsonb)`)
      if (i === 5 || i === 7) continue
      const [service] = asRows(await db().execute(sql`insert into agent_service(agent_id,kind,endpoint,source) values(${id},'a2a','https://fixture.invalid/agent','onchain') returning id`))
      const [probe] = asRows(await db().execute(sql`insert into probe(agent_id,service_id,ok,liveness,checked_at,task_kinds) values(${id},${Number(service!.id)},${i !== 2},${i === 2 ? 'dead' : i === 1 ? 'unbound' : 'live'},${new Date(Date.now() - (i === 3 ? 25 * 3600_000 : 0)).toISOString()},'[]'::jsonb) returning id`))
      await db().execute(sql`insert into probe_schedule(service_id,agent_id,last_probe_id,next_due_at) values(${Number(service!.id)},${id},${Number(probe!.id)},now())`)
    }
    await db().execute(sql`insert into agent_category(agent_id,category,confidence,method) values(${ids[5]!},'yield',1,'keyword'),(${ids[7]!},'security',1,'keyword')`)
    await db().execute(sql`insert into agent_category(agent_id,category,confidence,method) values
      (${ids[0]!},'health_factor',0.9,'keyword'),(${ids[0]!},'unclassified',1,'keyword'),
      (${ids[1]!},'grid',1,'keyword'),(${ids[4]!},'health_factor',1,'keyword'),
      (${ids[5]!},'grid',0.5,'keyword'),(${ids[6]!},'health_factor',1,'keyword')`)
    for (const id of [ids[5]!, ids[7]!]) {
      for (const [test, pass, at] of [['MCS-GRID-1', true, -2], ['MCS-YIELD-1', true, -1], ['MCS-YIELD-1', false, 0]] as const) {
        await db().execute(sql`insert into conformance_result(agent_id,test_id,test_version,tolerance_revision,category,case_id,chain_id,block_number,pass,request_hash,response_hash,ran_at) values(${id},${test},'1',1,'yield','synthetic',56,'1',${pass},'synthetic','synthetic',${new Date(Date.now() + at * 1000).toISOString()})`)
      }
    }
  })
  afterAll(async () => { await closeDb() })
  it('matches the original full query restricted to complete owner partitions', async () => {
    const all = asRows(await db().execute(marketplaceSourceQuery())).filter(r => r.owner_address === owner)
    const scoped = asRows(await db().execute(marketplaceSourceQuery([owner])))
    expect(scoped).toEqual(all)
  })
  it('preserves clone counts including an unbound sibling and remote-image fallback metadata', async () => {
    const rows = asRows(await db().execute(marketplaceSourceQuery([owner])))
    const live = rows.find(r => r.agent_id === ids[0])!
    expect(Number(live.identities)).toBe(2) // live and unbound siblings share owner/host; conformance-only has no host
    expect(live.meta_image).toBe('https://8004scan.io/scope.png')
    expect(rows.some(r => r.agent_id === ids[1])).toBe(true)
  })
  it('excludes dead, stale, other-owner and unsupported-network rows', async () => {
    const rows = asRows(await db().execute(marketplaceSourceQuery([owner])))
    for (const i of [2, 3, 4, 6, 7]) expect(rows.some(r => r.agent_id === ids[i])).toBe(false)
  })
  it('keeps the newest own-category failure instead of an unrelated or older pass', async () => {
    const row = asRows(await db().execute(marketplaceSourceQuery([owner]))).find(r => r.agent_id === ids[5])!
    expect(row.conf_test).toBe('MCS-YIELD-1'); expect(row.any_pass).toBe(false)
  })
  it('selects current classifications with the original precedence and chain scope', async () => {
    const selected = asRows(await db().execute(marketplaceCategoryQuery('health_factor'))).map(row => row.agent_id)
    expect(selected).toContain(ids[0]); expect(selected).toContain(ids[4]); expect(selected).not.toContain(ids[6])
    const grid = asRows(await db().execute(marketplaceCategoryQuery('grid'))).map(row => row.agent_id)
    expect(grid).toContain(ids[1]); expect(grid).not.toContain(ids[5])
  })
  it('preserves category results and clone counts across differently classified siblings', async () => {
    const selected = asRows(await db().execute(marketplaceCategoryQuery('health_factor'))).map(row => String(row.agent_id)).filter(id => ids.includes(id))
    const owners = asRows(await db().execute(sql`select distinct owner_address from agent where id in (${sql.join(selected.map(id => sql`${id}`), sql`, `)})`)).map(row => String(row.owner_address))
    const all = asRows(await db().execute(marketplaceSourceQuery())).filter(row => row.category === 'health_factor' && [owner, other].includes(String(row.owner_address)))
    const scoped = asRows(await db().execute(marketplaceSourceQuery(owners))).filter(row => row.category === 'health_factor')
    expect(scoped).toEqual(all)
    expect(Number(scoped.find(row => row.agent_id === ids[0])!.identities)).toBe(2)
  })
  it('keeps the default classified catalog while excluding unclassified and unsupported networks', async () => {
    const selected = asRows(await db().execute(marketplaceCategoryQuery())).map(row => row.agent_id)
    for (const i of [0, 1, 4, 5, 7]) expect(selected).toContain(ids[i])
    expect(selected).not.toContain(ids[6]); expect(selected).not.toContain(ids[2])
  })
})
