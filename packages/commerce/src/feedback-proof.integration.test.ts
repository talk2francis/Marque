import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { keccak256, toBytes } from 'viem'
import { network } from './config.js'
import { agentRatings, canonicalFeedback } from './rating.js'
import { teamWallets } from './quest.js'

const url=process.env['MARQUE_INTEGRATION_DB']
const enabled=!!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const provider=`0x${'2'.repeat(40)}`, client=`0x${'3'.repeat(40)}`, token=network(56).kernelToken
const rows=(r:unknown)=>r as Array<Record<string,unknown>>
let serial=0
const prefix=930000000000+Date.now()%100000000
describe.skipIf(!enabled)('exact feedback binding in isolated PostgreSQL, no RPC or payment',()=>{
  beforeAll(()=>{process.env['DATABASE_URL']=url})
  afterAll(async()=>{await closeDb()})
  async function fixture(kind='exact') {
    const id=String(prefix+(++serial)*10), job=id, identity=`56:${network(56).identityRegistry.toLowerCase()}:${id}`
    const buyer=kind==='self'?provider:kind==='team'?teamWallets()[0]!:client
    const hash=keccak256(toBytes(canonicalFeedback({chainId:56,jobId:job,agentId:id,client:buyer,stars:5,comment:null})))
    await db().execute(sql`insert into agent (id,chain_id,token_id,contract_address,owner_address,agent_wallet) values (${identity},56,${id},${network(56).identityRegistry},${provider},${provider})`)
    const [i]=rows(await db().execute(sql`insert into hire_intent (wallet,agent_id,category,chain_id,quote_id,provider,token,price_raw,description,description_hash,expired_at,job_id)
      values (${buyer},${kind==='otherIdentity'?identity+'0':identity},'yield',${kind==='wrongChain'?97:56},0,${provider},${token},'100','SYNTHETIC_P11','0x00',2000000000,${job}) returning id`))
    await db().execute(sql`insert into commerce_job (chain_id,job_id,client,provider,token,funded_raw,state,intent_id,created_block,updated_block)
      values (56,${job},${kind==='otherBuyer'?provider:buyer},${provider},${token},${kind==='zero'?'0':kind==='wrongAmount'?'99':'100'},${kind==='undelivered'?'FUNDED':'COMPLETED'},${String(i!['id'])},90,100)`)
    await db().execute(sql`insert into commerce_event (chain_id,tx_hash,log_index,block_number,contract,name,job_id,args)
      values (56,${'0x'+id.padStart(64,'0')},0,${kind==='beforeSubmission'?101:99},${network(56).commerce},'JobSubmitted',${job},'{}')`)
    const canonical=canonicalFeedback({chainId:56,jobId:job,agentId:id,client:buyer,stars:5,comment:null})
    await db().execute(sql`insert into rating_comment (feedback_hash,chain_id,job_id,agent_token_id,client,stars,canonical)
      values (${hash},56,${job},${id},${buyer},5,${canonical})`)
    await db().execute(sql`insert into rating (chain_id,agent_token_id,client,feedback_index,value,value_decimals,tag1,feedback_hash,tx_hash,block_number,revoked)
      values (56,${id},${buyer},'0',${kind==='wrongStars'?'80':'100'},0,'starred',${kind==='wrongHash'?'0x'+'0'.repeat(64):hash},${'0x'+id.padStart(64,'0')},100,${kind==='revoked'})`)
    return {id,job,identity,hash,buyer}
  }
  it('keeps exact delivered feedback and the default API shape, without claiming payment release',async()=>{
    const f=await fixture(),r=await agentRatings(56,f.id,provider)
    expect(r).toEqual({chainId:56,agentId:f.id,verifiedBuyers:{count:1,averageStars:5},allFeedback:{count:1,starredCount:1,averageStars:5}})
    const e=await agentRatings(56,f.id,provider,{evidence:true})
    expect(e.evidence?.buyerLinked).toMatchObject({feedbackRecords:1,distinctWallets:1,distinctJobs:1})
    expect(e.evidence?.independentHumans).toBeNull()
    expect(JSON.stringify(e.evidence)).not.toContain('SYNTHETIC_P11')
  })
  it.each(['otherIdentity','wrongHash','wrongChain','otherBuyer','zero','wrongAmount','undelivered','beforeSubmission','self','wrongStars','team','revoked'])('does not promote %s into buyer-linked feedback',async kind=>{
    const f=await fixture(kind),r=await agentRatings(56,f.id,provider,{evidence:true})
    expect(r.verifiedBuyers).toEqual({count:0,averageStars:null})
    expect(r.allFeedback.count).toBe(kind==='revoked'?0:1)
    expect(r.evidence?.independentHumans).toBeNull()
  })
  it('retains repeated feedback while deduplicating job and wallet units; reads do not mutate rows',async()=>{
    const f=await fixture()
    await db().execute(sql`insert into rating (chain_id,agent_token_id,client,feedback_index,value,value_decimals,tag1,feedback_hash,tx_hash,block_number)
      values (56,${f.id},${client},'1','100',0,'starred',${f.hash},${'0x'+(BigInt(f.id)+1n).toString().padStart(64,'0')},101)`)
    const before=rows(await db().execute(sql`select xmin::text,* from rating where chain_id=56 and agent_token_id=${f.id} order by feedback_index`))
    for(let n=0;n<2;n++){
      const r=await agentRatings(56,f.id,provider,{evidence:true})
      expect(r.evidence?.buyerLinked).toMatchObject({feedbackRecords:2,distinctWallets:1,distinctJobs:1,repeatedJobFeedbackRecords:1})
    }
    expect(rows(await db().execute(sql`select xmin::text,* from rating where chain_id=56 and agent_token_id=${f.id} order by feedback_index`))).toEqual(before)
  })
})
