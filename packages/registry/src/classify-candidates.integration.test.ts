import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { classifierCandidatesQuery } from './classify'

const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const stamp = Date.now()
const ids = Array.from({ length: 7 }, (_, i) => `56:classifier-fixture:${stamp}:${i}`)
const rows = (value: unknown) => value as Array<Record<string, unknown>>

describe.skipIf(!enabled)('classifier candidate identity staging, isolated PostgreSQL', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = url
    for (const [i, id] of ids.entries()) {
      await db().execute(sql`insert into agent(id,chain_id,contract_address,token_id,name,description,tags,raw_metadata)
        values(${id},${i === 5 ? 1 : i === 1 ? 97 : 56},'0x0000000000000000000000000000000000000001',${String(stamp + i)},
        ${i === 3 || i === 6 ? null : `fixture ${i}`},null,${JSON.stringify(i === 6 ? ['yield'] : [])}::jsonb,'{}'::jsonb)`)
    }
    await db().execute(sql`insert into agent_category(agent_id,category,confidence,method) values
      (${ids[2]!},'unclassified',1,'keyword'),(${ids[4]!},'yield',1,'keyword'),(${ids[4]!},'grid',1,'keyword')`)
    await db().execute(sql`insert into probe(agent_id,ok,liveness,checked_at,skills) values
      (${ids[0]!},true,'live',now()-interval '2 seconds','["fixture.skills"]'::jsonb),
      (${ids[0]!},true,'live',now(),'[]'::jsonb),(${ids[1]!},false,'dead',now(),'[]'::jsonb)`)
  })
  afterAll(async () => { await closeDb() })
  it.each([false, true])('preserves the complete original candidate set and skill observation, live-only=%s', async live => {
    const original = rows(await db().execute(sql`
      select a.id,a.name,a.description,a.tags,coalesce((select p.skills from probe p
        where p.agent_id=a.id and jsonb_array_length(p.skills)>0 order by p.checked_at desc limit 1),'[]'::jsonb) as skills
      from agent a where a.chain_id in(56,97) and a.id in(${sql.join(ids.map(id => sql`${id}`), sql`,`)})
        and not exists(select 1 from agent_category c where c.agent_id=a.id)
        and(a.name is not null or a.description is not null or jsonb_array_length(a.tags)>0)
        ${live ? sql`and exists(select 1 from probe p where p.agent_id=a.id and p.liveness='live')` : sql``}`))
    const staged = rows(await db().execute(classifierCandidatesQuery(1_000_000, live))).filter(row => ids.includes(String(row.id)))
    const sort = (value: Array<Record<string, unknown>>) => value.sort((a, b) => String(a.id).localeCompare(String(b.id)))
    expect(sort(staged)).toEqual(sort(original))
    expect(staged.map(row => row.id).sort()).toEqual((live ? [ids[0]!] : [ids[0]!, ids[1]!, ids[6]!]).sort())
    expect(staged.find(row => row.id === ids[0])!.skills).toEqual(['fixture.skills'])
  })
})
