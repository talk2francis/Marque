import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { network } from '@marque/commerce'
import type { BuilderView } from './builder'

const state = vi.hoisted(() => ({ owner: '0x1111111111111111111111111111111111111111', rpc: true, wallet: null as string | null, view: null as unknown, claim: null as unknown }))
vi.mock('@marque/commerce', async original => ({ ...await original<object>(), sellerIdentity: async () => { if (!state.rpc) throw new Error('RPC down'); return { agentOwner: state.owner, agentWallet: state.wallet ?? state.owner, blockNumber: '123456' } } }))
vi.mock('./builder', () => ({ builderView: async () => state.view, builderIdentities: async () => [] }))
vi.mock('./claim', () => ({ readClaimToken: (t: string) => { if(t==='synthetic-unconfigured') throw new Error('synthetic missing secret'); return t === 'synthetic-owner' ? state.claim : null } }))
import { sellerProjection } from './seller'
import { GET } from '../app/api/v1/builders/checks/route'
const url = process.env.MARQUE_INTEGRATION_DB
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const owner = state.owner
const rows = (v: unknown) => v as Array<Record<string, unknown>>
let view: BuilderView
let service: number
let intent: string
const amount = '9007199254740993123456789'
describe.skipIf(!enabled)('seller projection with isolated real PostgreSQL', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    const tokenId = String(920000000000 + Date.now() % 100000000)
    const agentKey = `56:${network(56).identityRegistry.toLowerCase()}:${tokenId}`
    await db().execute(sql`insert into agent (id, chain_id, token_id, contract_address, owner_address, agent_wallet) values (${agentKey},56,${tokenId},${network(56).identityRegistry},${owner},${owner})`)
    const [s] = rows(await db().execute(sql`insert into agent_service (agent_id, kind, endpoint, source) values (${agentKey},'a2a','https://example.org/card','top_level') returning id`));service = Number(s!.id)
    const [q] = rows(await db().execute(sql`insert into commerce_quote (source, agent_id, service_id, endpoint, ok, chain_id, provider, token, price_raw, signed, quote_expires_at, raw) values ('user',${agentKey},${service},'https://example.org/card',true,56,${owner},${network(56).kernelToken},${amount},true,now()+interval '5 minutes','{"task":"PRIVATE_TASK_MUST_NOT_LEAK"}') returning id`))
    await db().execute(sql`insert into commerce_quote (source,agent_id,service_id,endpoint,ok,failure,detail) values ('user',${agentKey},${service},'https://example.org/card',false,'expired','PRIVATE_FAILURE_BODY')`)
    await db().execute(sql`insert into commerce_quote (source,agent_id,service_id,endpoint,ok,chain_id,provider,signed,quote_expires_at) values ('probe',${agentKey},${service},'https://example.org/card',true,56,${owner},false,now()-interval '1 minute')`)
    const jobId = tokenId
    const [i] = rows(await db().execute(sql`insert into hire_intent (wallet,agent_id,service_id,category,chain_id,quote_id,provider,token,price_raw,description,description_hash,expired_at,job_id) values (${owner},${agentKey},${service},'yield',56,${Number(q!.id)},${owner},${network(56).kernelToken},${amount},'private intent','0x00',2000000000,${jobId}) returning id`));intent=String(i!.id)
    await db().execute(sql`insert into commerce_job (chain_id,job_id,client,provider,token,funded_raw,deliverable,state,intent_id,created_at,updated_block) values (56,${jobId},${owner},${owner},${network(56).kernelToken},${amount},'0xartifact','PAID',${intent},now(),123456)`)
    await db().execute(sql`insert into commerce_event (chain_id,tx_hash,log_index,block_number,contract,name,job_id,args) values (56,${'0x'+tokenId.padStart(64,'0')},0,123456,${network(56).commerce},'PaymentReleased',${jobId},${JSON.stringify({amount})}::jsonb)`)
    view={identity:{chainId:56,tokenId,agentKey,registry:network(56).identityRegistry,owner,readFailed:false,name:'Synthetic seller',description:null,services:[{kind:'a2a',endpoint:'https://example.org/card'}]},verdict:{qualityListing:false,passed:0,checks:[]},category:'yield',declared:null,classified:{category:'yield',confidence:1,rationale:null},endpoint:'https://example.org/card',listed:false,listingEvidence:{version:1,ownerListed:false,qualityListed:false,localChecksPassed:false,warrant:'separate_service_test',hireability:'requires_current_quote',officialCampaign:'not_determined'},availability:{windowHours:24,attempts:0,successes:0,firstAt:null,lastAt:null,scope:'synthetic'}}
    state.view=view;state.claim={owner,chainId:56,tokenId,agentId:agentKey}
  })
  afterAll(async () => { await closeDb() })
  function request(auth?: string, tokenId=view.identity.tokenId) { return new NextRequest(`https://candidate.invalid/api/v1/builders/checks?wallet=${owner}&chainId=56&tokenId=${tokenId}`,{headers:auth?{authorization:auth}:{}}) }
  it('shows current unindexed declarations first without borrowing old service observations, including web', async () => {
    const original = view.identity.services
    view.identity.services = [{kind:'a2a',endpoint:'https://example.org//.well-known/agent-card.json'}, {kind:'web',endpoint:'https://example.org/current-web'}, {kind:'other',endpoint:'https://example.org/custom-extension'}]
    try {
      const p = await sellerProjection(view)
      expect(p.services.slice(0,2)).toMatchObject([{serviceId:null,kind:'a2a',declaredNow:true,probe:{liveness:'UNKNOWN'},quote:{state:'NO_SAMPLE'}},{serviceId:null,kind:'web',declaredNow:true}])
      expect(p.services.find(s => s.serviceId === service)?.declaredNow).toBe(false)
      expect(p.services.some(s => s.kind === 'other')).toBe(false)
    } finally { view.identity.services = original }
  })
  it('public read uses exact cohort, keeps payment strings and omits private diagnostics', async () => {
    const p=await sellerProjection(view)
    expect(p.jobs).toMatchObject({received:1,funded:1,submitted:1,completed:1,paid:1,refunded:0,fundingMismatch:0,headLagBlocks:null})
    expect(p.earnings).toMatchObject([{amountRaw:amount,chainId:56,decimals:null,kind:'PAYMENT_RELEASED'}])
    expect(p.diagnostics).toBeNull();expect(p.services[0]?.quote).toMatchObject({state:'EXPIRED',mode:'IDENTITY_MATCHED_UNSIGNED'})
    expect(JSON.stringify(p)).not.toMatch(/PRIVATE_TASK|PRIVATE_FAILURE|private intent/)
  })
  it('owner-only attempts/conversion separate accepted, rejected, signed and funding',async()=>{
    const p=await sellerProjection(view,owner)
    expect(p.diagnostics).toMatchObject({quotes:{attempted:2,accepted:1,rejected:1,providerSigned:1,identityMatchedUnsigned:0},conversion:{acceptedQuotes:1,fundedQuotes:1}})
    expect(p.diagnostics?.failures[0]?.code).toBe('expired')
  })
  it('GET is observational and no-store; no authentication means no diagnostics',async()=>{
    const before=rows(await db().execute(sql`select xmin::text, * from hire_intent where id=${intent}`))
    for(let i=0;i<2;i++){const r=await GET(request());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect((await r.json()).identities[0].seller.diagnostics).toBeNull()}
    expect(rows(await db().execute(sql`select xmin::text, * from hire_intent where id=${intent}`))).toEqual(before)
  })
  it('expired/invalid bearer fails; a different identity cannot use a valid claim',async()=>{
    expect((await GET(request('Bearer invalid'))).status).toBe(401)
    expect((await GET(request('Bearer synthetic-owner',String(BigInt(view.identity.tokenId)+1n)))).status).toBe(403)
  })
  it('unconfigured verification is a controlled no-store503, not an unhandled500',async()=>{
    const r=await GET(request('Bearer synthetic-unconfigured'));expect(r.status).toBe(503);expect(r.headers.get('cache-control')).toBe('no-store');expect(await r.json()).toMatchObject({error:'diagnostics_unavailable'})
  })
  it('authorized header reveals aggregates without raw private data',async()=>{
    const r=await GET(request('Bearer synthetic-owner'));expect(r.status).toBe(200)
    const body=await r.json();expect(body.identities[0].seller.diagnostics.quotes.attempted).toBe(2)
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE_TASK|PRIVATE_FAILURE|private intent/)
  })
  it('transfer invalidates private access; public projection shows current owner separately',async()=>{
    state.owner='0x2222222222222222222222222222222222222222'
    try{expect((await GET(request('Bearer synthetic-owner'))).status).toBe(403);expect((await sellerProjection(view)).identity.owner).toBe(state.owner)}finally{state.owner=owner}
  })
  it('RPC failure is explicit unknown publicly and private access fails closed',async()=>{
    state.rpc=false
    try{const p=await sellerProjection(view);expect(p.identity.current).toBe(false);expect(p.qualification.ownerListed).toBe(false);expect((await GET(request('Bearer synthetic-owner'))).status).toBe(403)}finally{state.rpc=true}
  })
  it('preserves the existing verifier allowance for an owner-signed quote with a separate agent wallet',async()=>{
    state.wallet='0x3333333333333333333333333333333333333333'
    try{
      await db().execute(sql`insert into commerce_quote(source,agent_id,service_id,endpoint,ok,chain_id,provider,signed,quote_expires_at) values ('probe',${view.identity.agentKey},${service},'https://example.org/card',true,56,${owner},true,now()+interval '5 minutes')`)
      expect((await sellerProjection(view)).services[0]?.quote.state).toBe('CURRENT_PROBE_SAMPLE')
    }finally{state.wallet=null}
  })
  it('a later failed sample wins over an old good price',async()=>{
    await db().execute(sql`insert into commerce_quote(source,agent_id,service_id,endpoint,ok,failure,created_at) values ('probe',${view.identity.agentKey},${service},'https://example.org/card',false,'provider_mismatch',now()+interval '1 second')`)
    expect((await sellerProjection(view)).services[0]?.quote).toMatchObject({state:'NOT_HIREABLE',mode:'UNKNOWN'})
  })
  it('reports a mismatched funded amount as a recovery warning',async()=>{
    await db().execute(sql`update commerce_job set funded_raw='1' where intent_id=${intent}`)
    try{expect((await sellerProjection(view)).jobs.fundingMismatch).toBe(1)}finally{await db().execute(sql`update commerce_job set funded_raw=${amount} where intent_id=${intent}`)}
  })
  it('keeps refunds out of earned payment-release amounts',async()=>{
    const jobId=view.identity.tokenId+'2'
    const [i]=rows(await db().execute(sql`insert into hire_intent(wallet,agent_id,service_id,category,chain_id,quote_id,provider,token,price_raw,description,description_hash,expired_at,job_id)
      select wallet,agent_id,service_id,category,chain_id,quote_id,provider,token,'13','synthetic refund','0x00',expired_at,${jobId} from hire_intent where id=${intent} returning id`))
    await db().execute(sql`insert into commerce_job(chain_id,job_id,client,provider,token,funded_raw,state,intent_id,created_at,updated_block) values(56,${jobId},${owner},${owner},${network(56).kernelToken},'13','REFUNDED',${String(i!.id)},now(),123457)`)
    await db().execute(sql`insert into commerce_event(chain_id,tx_hash,log_index,block_number,contract,name,job_id,args) values(56,${'0x'+jobId.padStart(64,'0')},0,123457,${network(56).commerce},'Refunded',${jobId},'{"amount":"13"}')`)
    const p=await sellerProjection(view);expect(p.jobs).toMatchObject({received:2,paid:1,refunded:1});expect(p.earnings.find(e=>e.kind==='PAYMENT_RELEASED')?.amountRaw).toBe(amount);expect(p.earnings.find(e=>e.kind==='REFUNDED_TO_BUYER')?.amountRaw).toBe('13')
  })
  it('unbound same-provider jobs are excluded instead of attributed to the seller',async()=>{
    const before=(await sellerProjection(view)).jobs.received
    await db().execute(sql`insert into commerce_job(chain_id,job_id,client,provider,state,created_at) values(56,${view.identity.tokenId+'1'},${owner},${owner},'PAID',now())`)
    expect((await sellerProjection(view)).jobs.received).toBe(before)
  })
  it('MCP discovery is not promoted into an escrow hire adapter',async()=>{
    await db().execute(sql`insert into agent_service(agent_id,kind,endpoint,source) values(${view.identity.agentKey},'mcp','https://example.org/mcp','top_level')`)
    const m=(await sellerProjection(view)).services.find(s=>s.kind==='mcp');expect(m?.quote.state).toBe('UNSUPPORTED_HIRE_ADAPTER');expect(m?.quote.nextStep).toContain('requires an A2A ERC-8183 service')
  })

})
