import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
import {sql} from 'drizzle-orm'
import {db,closeDb} from '@marque/db'
import {network} from '@marque/commerce'
vi.mock('@marque/db',async original=>({...await original<object>(),cachedProjection:async(_key:string,fn:()=>Promise<unknown>)=>({value:await fn(),computedAt:new Date().toISOString(),ageMs:0,stale:false})}))
vi.mock('./market-cache',()=>({marketplaceAgentsCached:async()=>({rows:[]})}))
import {builderDemand} from './builder-demand-data'
import {builderLoop} from './builder-loop-data'
const url=process.env.MARQUE_INTEGRATION_DB,enabled=!!url&&/^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const owner='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),buyer='0x'+'3'.repeat(40),token=network(56).kernelToken
const agent='56:'+network(56).identityRegistry.toLowerCase()+':'+String(930000000000+Date.now()%10000000),rival=agent+'1'
const rows=(r:unknown)=>r as Array<Record<string,unknown>>
let service:number,otherService:number,next=0
const tenderIds:Record<string,string>={}
async function quote(id:string,s:number,ok=true){return Number(rows(await db().execute(sql`insert into commerce_quote(source,agent_id,service_id,endpoint,ok,chain_id,provider,token,price_raw,token_symbol,token_decimals,signed,failure,raw) values ('user',${id},${s},'https://example.org/card',${ok},56,${id===agent?owner:other},${token},'100','U',18,true,${ok?null:'timeout'},'{"task":"PRIVATE_TASK"}') returning id`))[0]!.id)}
async function funded(id:string,s:number,q:number,provider:string,amount='100'){
 const jobId=String(940000000000+Date.now()%10000000+(next++)),wallet=id===agent?owner:other
 const i=String(rows(await db().execute(sql`insert into hire_intent(wallet,agent_id,service_id,category,chain_id,quote_id,provider,token,price_raw,description,description_hash,expired_at,job_id) values (${buyer},${id},${s},'health_factor',56,${q},${wallet},${token},'100','PRIVATE_TASK','0x00',2000000000,${jobId}) returning id`))[0]!.id)
 await db().execute(sql`insert into commerce_job(chain_id,job_id,client,provider,token,funded_raw,state,intent_id,created_at,updated_block) values (56,${jobId},${buyer},${provider},${token},${amount},'PAID',${i},now(),123)`)
 return jobId
}
describe.skipIf(!enabled)('post-close read projections on an isolated PostgreSQL schema',()=>{
 beforeAll(async()=>{
  process.env.DATABASE_URL=url
  await db().execute(sql`insert into agent(id,chain_id,token_id,contract_address,owner_address,agent_wallet,name) values (${agent},56,${agent.split(':')[2]},${network(56).identityRegistry},${owner},${owner},'Fixture agent'),(${rival},56,${rival.split(':')[2]},${network(56).identityRegistry},${other},${other},'Fixture other agent')`)
  service=Number(rows(await db().execute(sql`insert into agent_service(agent_id,kind,endpoint,source) values (${agent},'a2a','https://example.org/card','top_level') returning id`))[0]!.id)
  otherService=Number(rows(await db().execute(sql`insert into agent_service(agent_id,kind,endpoint,source) values (${rival},'a2a','https://example.org/other','top_level') returning id`))[0]!.id)
  for(const outcome of ['won','lost','did_not_quote','wrong_provider','wrong_amount']){
   const t=String(rows(await db().execute(sql`insert into tender(category,chain_id,task_hash,shape,asked) values ('health_factor',56,'0x00','{}',2) returning id`))[0]!.id);tenderIds[outcome]=t
   const q=await quote(agent,service,outcome!=='did_not_quote')
   await db().execute(sql`insert into tender_quote(tender_id,agent_id,service_id,ok,outcome,quote_id,price_raw,token_symbol,latency_ms,detail) values (${t},${agent},${service},${outcome!=='did_not_quote'},${outcome==='did_not_quote'?'timeout':'priced'},${q},'100','U',900,'PRIVATE_RESPONSE')`)
   if(outcome==='won')await funded(agent,service,q,owner)
   if(outcome==='lost'){const q2=await quote(rival,otherService);await db().execute(sql`insert into tender_quote(tender_id,agent_id,service_id,ok,outcome,quote_id) values (${t},${rival},${otherService},true,'priced',${q2})`);await funded(rival,otherService,q2,other)}
   if(outcome==='wrong_provider')await funded(agent,service,q,other)
   if(outcome==='wrong_amount')await funded(agent,service,q,owner,'99')
  }
 })
 afterAll(async()=>{await closeDb()})
 it('distinguishes won, lost and a failed quote from exact funded records, excluding amount or provider mismatches',async()=>{
  const report=await builderDemand(agent);expect(report.total).toBe(5)
  expect(report.rows.map(r=>r.outcome).sort()).toEqual(['did_not_quote','lost','not_funded','not_funded','won'])
  expect(report.rows.find(r=>r.outcome==='won')?.ownJob?.priceRaw).toBe('100')
  expect(report.rows.find(r=>r.outcome==='lost')?.selectedJob?.agentId).toBe(rival)
  expect(report.rows.every(r=>r.badgesAtQuote===null)).toBe(true)
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE_TASK|PRIVATE_RESPONSE|1111111111111111111111111111111111111111|3333333333333333333333333333333333333333/)
 })
 it('keeps the newest failing probe visible, and refuses a signed quote payable to a different wallet',async()=>{
  await db().execute(sql`insert into probe(agent_id,service_id,ok,liveness,checked_at) values (${agent},${service},true,'live',now()-interval '2 minutes'),(${agent},${service},false,'dead',now())`)
  await db().execute(sql`insert into commerce_quote(source,agent_id,service_id,endpoint,ok,chain_id,provider,signed,quote_expires_at) values ('probe',${agent},${service},'https://example.org/card',true,56,${other},true,now()+interval '10 minutes')`)
  const value=(await builderLoop(agent)).value!
  expect(value.nodes.find(n=>n.id==='answering')?.state).toBe('unavailable');expect(value.nodes.find(n=>n.id==='priced')?.state).toBe('unavailable')
  expect(value.nodes.find(n=>n.id==='paid')?.state).toBe('not_recorded')
 })
 it('uses the matching payment event and makes an expired quote explicit',async()=>{
  const q=await quote(agent,service),jobId=await funded(agent,service,q,owner)
  await db().execute(sql`insert into commerce_event(chain_id,tx_hash,log_index,block_number,block_time,contract,name,job_id,args) values (56,${'0x'+jobId.padStart(64,'0')},0,123,now(),${network(56).commerce},'PaymentReleased',${jobId},'{"amount":"100"}')`)
  await db().execute(sql`insert into commerce_quote(source,agent_id,service_id,endpoint,ok,chain_id,provider,signed,quote_expires_at) values ('probe',${agent},${service},'https://example.org/card',true,56,${owner},true,now()-interval '1 minute')`)
  const value=(await builderLoop(agent)).value!
  expect(value.nodes.find(n=>n.id==='paid')).toMatchObject({state:'observed',href:`/jobs/56/${jobId}`});expect(value.nodes.find(n=>n.id==='priced')?.state).toBe('expired')
 })
})
