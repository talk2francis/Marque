import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { agentState, agentStates, agentServiceEvidenceQuery } from './agent-state'

const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const stamp = Date.now()
const ids = [`56:capability-perf:${stamp}:0`, `56:capability-perf:${stamp}:1`]
const now = new Date()
const rows = (value: unknown) => value as Array<Record<string, unknown>>
let first = 0, second = 0, unprobed = 0, failedProbe = 0, validProbe = 0

describe.skipIf(!enabled)('exact latest-probe reads in isolated PostgreSQL', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = url
    for (const [i, id] of ids.entries()) {
      await db().execute(sql`insert into agent(id,chain_id,contract_address,token_id,name,detail_fetched) values(${id},56,'0x0000000000000000000000000000000000000001',${`${stamp}${i}`},${`capability fixture ${i}`},true)`)
      await db().execute(sql`insert into agent_category(agent_id,category,confidence,method) values(${id},'yield',1,'keyword')`)
    }
    for (const [agent, kind] of [[ids[0]!, 'a2a'], [ids[1]!, 'a2a'], [ids[0]!, 'mcp']] as const) {
      const [service] = rows(await db().execute(sql`insert into agent_service(agent_id,kind,endpoint,source) values(${agent},${kind},${`https://fixture.invalid/${kind}/card`},'onchain') returning id`))
      if (!first) first = Number(service!.id)
      else if (!second) second = Number(service!.id)
      else unprobed = Number(service!.id)
    }
    const probe = async (agent: string, service: number, live: boolean, age: number) => {
      const [row] = rows(await db().execute(sql`insert into probe(agent_id,service_id,ok,liveness,checked_at,executable_endpoint,task_kinds,manifest) values(${agent},${service},${live},${live ? 'live' : 'dead'},${new Date(now.getTime() - age).toISOString()},'https://fixture.invalid/a2a','["yield"]'::jsonb,'{"skills":[{"id":"yield"}],"capabilityEvidence":{"messageSendCallable":true}}'::jsonb) returning id`))
      return Number(row!.id)
    }
    const old = await probe(ids[0]!, first, true, 3_600_000)
    failedProbe = await probe(ids[0]!, first, false, 60_000)
    validProbe = await probe(ids[1]!, second, true, 60_000)
    await probe(ids[0]!, second, false, 10_000) // Deliberately inconsistent identity: must not contaminate the batch.
    await db().execute(sql`insert into probe_schedule(service_id,agent_id,last_probe_id,next_due_at) values(${first},${ids[0]!},${old},now())`)
  })
  afterAll(async () => { await closeDb() })

  it('reads a newer failed manual observation instead of a stale scheduled pointer', async () => {
    const row = rows(await db().execute(agentServiceEvidenceQuery([ids[0]!]))).find(row => Number(row.service_id) === first)!
    expect(Number(row.probe_id)).toBe(failedProbe)
    expect(row.liveness).toBe('dead')
    expect((await agentState(ids[0]!, 'yield', now))?.hireable).toBe(false)
  })
  it('does not let a newer foreign-identity observation replace exact service evidence', async () => {
    const result = await agentStates(ids, 'yield', now)
    expect(result.get(ids[1]!)).toMatchObject({ hireable: true, selectedService: { serviceId: second, probeId: validProbe } })
  })
  it('matches independent single-identity evaluations when batched', async () => {
    const batch = await agentStates(ids, 'yield', now)
    for (const id of ids) expect(batch.get(id)).toEqual(await agentState(id, 'yield', now))
  })
  it('keeps a never-probed service explicitly unknown', async () => {
    const row = rows(await db().execute(agentServiceEvidenceQuery([ids[0]!]))).find(row => Number(row.service_id) === unprobed)!
    expect(row.probe_id).toBeNull(); expect(row.checked_at).toBeNull(); expect(row.liveness).toBeNull()
  })
  it('does not return services from identities outside the requested set', async () => {
    const selected = rows(await db().execute(agentServiceEvidenceQuery([ids[0]!])) )
    expect(selected).toHaveLength(2)
    expect(selected.every(row => row.agent_id === ids[0])).toBe(true)
  })
})
