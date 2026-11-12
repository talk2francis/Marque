import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { funnelSourceQuery } from './funnel'

const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const stamp = Date.now()
const ids = Array.from({ length: 12 }, (_, i) => `56:funnel-fixture:${stamp}:${i}`)
const original = readFileSync(new URL('./fixtures/funnel-original.sql', import.meta.url), 'utf8')
const rows = (value: unknown) => value as Array<Record<string, unknown>>

describe.skipIf(!enabled)('complete funnel aggregation, real isolated PostgreSQL', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = url
    for (const [i, id] of ids.entries()) {
      await db().execute(sql`insert into agent(id,chain_id,contract_address,token_id,name,detail_fetched,raw_metadata)
        values(${id},${i === 9 ? 97 : 56},'0x0000000000000000000000000000000000000001',${String(stamp+i)},${`fixture ${i}`},${i%2===0},'{}'::jsonb)`)
      if (i === 0 || i === 7) continue
      const copies = i === 8 ? 2 : 1
      for (let copy = 0; copy < copies; copy++) {
        const [service] = rows(await db().execute(sql`insert into agent_service(agent_id,kind,endpoint,source,currently_declared)
          values(${id},${i === 11 ? 'web' : copy ? 'mcp' : 'a2a'},'https://fixture.invalid/agent','onchain',${i !== 4}) returning id`))
        const kind = i === 9 ? 'health_factor' : i === 4 ? 'yield' : 'grid'
        const [probe] = rows(await db().execute(sql`insert into probe(agent_id,service_id,ok,liveness,checked_at,executable_endpoint,task_kinds)
          values(${id},${Number(service!.id)},true,${i === 3 || i === 10 ? 'unbound' : i === 6 ? 'dead' : 'live'},
          ${new Date(Date.now()-(i === 2 ? 48*3600_000 : 0)).toISOString()},${i === 3 || i === 10 ? null : 'https://fixture.invalid/answer'},
          ${JSON.stringify(i === 5 ? [] : [kind])}::jsonb) returning id`))
        await db().execute(sql`insert into probe_schedule(service_id,agent_id,last_probe_id,next_due_at)
          values(${Number(service!.id)},${id},${Number(probe!.id)},now())`)
        if (i === 10) await db().execute(sql`insert into probe(agent_id,service_id,ok,liveness,executable_endpoint,task_kinds)
          values(${id},${Number(service!.id)},true,'live','https://fixture.invalid/newer','["grid"]'::jsonb)`)
      }
      await db().execute(sql`insert into agent_category(agent_id,category,confidence,method)
        values(${id},${i === 9 ? 'health_factor' : i === 4 ? 'yield' : 'grid'},0.9,'keyword')`)
      if (i === 8) await db().execute(sql`insert into agent_category(agent_id,category,confidence,method)
        values(${id},'unclassified',1,'keyword')`)
    }
    for (const i of [6,7,9]) {
      await db().execute(sql`insert into conformance_result(agent_id,test_id,test_version,tolerance_revision,category,case_id,chain_id,block_number,pass,request_hash,response_hash,ran_at)
        values(${ids[i]!},'MCS-GRID-1','1',1,'grid','fixture',${i === 9 ? 97 : 56},'1',true,'fixture','fixture',now()-interval '2 seconds')`)
      if (i === 6) await db().execute(sql`insert into conformance_result(agent_id,test_id,test_version,tolerance_revision,category,case_id,chain_id,block_number,pass,request_hash,response_hash,ran_at)
        values(${ids[i]!},'MCS-GRID-1','1',1,'grid','fixture',56,'2',false,'fixture','fixture',now())`)
    }
  })
  afterAll(async () => { await closeDb() })
  it.each([56,97])('matches every original population count at one snapshot on chain %s', async chainId => {
    await db().transaction(async tx => {
      await tx.execute(sql`set transaction isolation level repeatable read read only`)
      await tx.execute(sql`set local jit=off`)
      // Only these fixed, test-owned chain constants are substituted into the frozen reference query.
      const previous = rows(await tx.execute(sql.raw(original.replaceAll('$1', String(chainId)))))
      const next = rows(await tx.execute(funnelSourceQuery(chainId)))
      expect(next).toEqual(previous)
      expect(Number(next[0]!.registered)).toBeGreaterThan(0)
      expect(Number(next[0]!.hireable)).toBeGreaterThan(0)
      expect(Object.keys(next[0]!)).toHaveLength(8)
    })
  })
})
