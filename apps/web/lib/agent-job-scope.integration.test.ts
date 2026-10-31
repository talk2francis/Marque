import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeDb, db } from '@marque/db'
import { network, questJob } from '@marque/commerce'
import { agentSampleJobs } from './agent-job-scope'
import { computeTracks } from './agent-track'

const url = process.env.MARQUE_INTEGRATION_DB
const enabled = Boolean(url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1)))
const wallet = `0x${randomBytes(20).toString('hex')}`
const unique = `0x${randomBytes(20).toString('hex')}`
const oldWallet = `0x${randomBytes(20).toString('hex')}`
const prefix = BigInt(940000000000 + Date.now() % 100000000)
const tokens = Array.from({length:4}, (_,i)=>(prefix+BigInt(i)).toString())
const chains = [56,56,97,56] as const
const ids = tokens.map((token,i)=>`${chains[i]}:${network(chains[i]!).identityRegistry.toLowerCase()}:${token}`)
const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string,unknown>>

describe.skipIf(!enabled)('one delivery is not assigned to several identities sharing a payment wallet', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL=url
    for(let i=0;i<4;i++) await db().execute(sql`
      insert into agent(id,chain_id,token_id,contract_address,owner_address,agent_wallet)
      values (${ids[i]!},${chains[i]!},${tokens[i]!},${network(chains[i]!).identityRegistry},${wallet},${i===3?unique:i===1?'0x'+wallet.slice(2).toUpperCase():wallet})`)
    const [service]=rows(await db().execute(sql`insert into agent_service(agent_id,kind,endpoint,source) values (${ids[0]!},'a2a','https://fixture.invalid/card','top_level') returning id`))
    const [quote]=rows(await db().execute(sql`insert into commerce_quote(source,agent_id,service_id,endpoint,ok) values ('user',${ids[0]!},${Number(service!.id)},'https://fixture.invalid/card',true) returning id`))
    const [intent]=rows(await db().execute(sql`
      insert into hire_intent(wallet,agent_id,service_id,category,chain_id,quote_id,provider,token,price_raw,description,description_hash,expired_at,job_id)
      values (${unique},${ids[0]!},${Number(service!.id)},'grid',56,${Number(quote!.id)},${oldWallet},${network(56).kernelToken},'1','Synthetic exact agent link','0x00',2000000000,${tokens[1]!}) returning id`))
    const hash=`0x${'1'.repeat(64)}`
    await db().execute(sql`
      insert into commerce_job(chain_id,job_id,client,provider,funded_raw,deliverable,state,intent_id,updated_block) values
      (56,${tokens[0]!},${unique},${wallet},'1',${hash},'SUBMITTED',null,999999),
      (56,${tokens[1]!},${unique},${oldWallet},'1',${hash},'PAID',${String(intent!.id)},20),
      (97,${tokens[2]!},${oldWallet},${wallet},'1',${hash},'PAID',null,30),
      (56,${tokens[3]!},${oldWallet},${unique},'1',${hash},'PAID',null,40),
      (97,${tokens[1]!},${unique},${oldWallet},'1',${hash},'PAID',${String(intent!.id)},50),
      (56,${(prefix+10n).toString()},${unique},${oldWallet},'1',${hash},'PAID',${String(intent!.id)},60)`)
  })
  afterAll(async()=>{await closeDb()})

  it('excludes an unlinked shared-wallet delivery, including differently cased bindings', async()=>{
    expect((await agentSampleJobs(ids[0]!,56,wallet)).map(x=>x.job_id)).not.toContain(tokens[0])
    expect(await agentSampleJobs(ids[1]!,56,wallet)).toEqual([])
  })
  it('keeps the exact agent hire after payment-wallet rotation, even without a current wallet', async()=>{
    expect((await agentSampleJobs(ids[0]!,56,wallet)).map(x=>x.job_id)).toEqual([tokens[1]])
    expect((await agentSampleJobs(ids[0]!,56,null)).map(x=>x.job_id)).toEqual([tokens[1]])
  })
  it('retains uniquely associated outside jobs on their own network', async()=>{
    expect((await agentSampleJobs(ids[3]!,56,unique)).map(x=>x.job_id)).toEqual([tokens[3]])
    expect((await agentSampleJobs(ids[2]!,97,wallet)).map(x=>x.job_id)).toEqual([tokens[2]])
    expect(await agentSampleJobs(ids[0]!,97,wallet)).toEqual([])
  })
  it('uses the same rule for profile totals and does not credit mainnet identities with testnet work', async()=>{
    const mainnet=await computeTracks(56),testnet=await computeTracks(97)
    expect(mainnet[tokens[0]!]?.jobs).toMatchObject({funded:1,delivered:1,settled:1})
    expect(mainnet[tokens[1]!]?.jobs.delivered??0).toBe(0)
    expect(mainnet[tokens[3]!]?.jobs.delivered).toBe(1)
    expect(testnet[tokens[2]!]?.jobs.delivered).toBe(1)
    expect(testnet[tokens[0]!]).toBeUndefined()
  })
  it('keeps shared-wallet Job Rooms readable without choosing an arbitrary agent or accepting a mismatched intent', async()=>{
    const shared=await questJob(56,tokens[0]!)
    expect(shared?.provider).toBe(wallet)
    expect(shared?.agent?.agentKey).toBeNull()
    expect(shared?.deliverable.hash).toBe(`0x${'1'.repeat(64)}`)
    expect((await questJob(56,tokens[1]!))?.agent?.agentKey).toBe(ids[0])
    expect((await questJob(97,tokens[2]!))?.agent?.agentKey).toBe(ids[2])
    const mismatch=await questJob(97,tokens[1]!)
    expect(mismatch?.agent?.agentKey).toBeNull()
    expect(mismatch?.intent).toBeNull()
    expect(mismatch?.reasons).toContain('not_marque')
  })
})
