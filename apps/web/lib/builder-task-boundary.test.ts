import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({ readContract:vi.fn(), probeService:vi.fn(), probeA2ACall:vi.fn(), safeFetch:vi.fn(), insert:vi.fn(), values:vi.fn(), claim:vi.fn(), current:vi.fn(), capture:vi.fn(), run:vi.fn(), bundle:vi.fn() }))
vi.mock('@marque/db',async original=>({...await original<object>(),db:()=>({insert:mocks.insert})}))
vi.mock('@marque/commerce',async original=>({...await original<object>(),chainClient:()=>({readContract:mocks.readContract})}))
vi.mock('@marque/probe',async original=>({...await original<object>(),probeService:mocks.probeService,probeA2ACall:mocks.probeA2ACall,safeFetch:mocks.safeFetch}))
vi.mock('./claim',()=>({readClaimToken:mocks.claim,claimOwnerIsCurrent:mocks.current}))
vi.mock('./limits',()=>({checkTestBurst:()=>({ok:true}),checkClaimBurst:()=>({ok:true}),checkWindow:()=>({ok:true}),clientKey:()=> 'fixture'}))
vi.mock('@marque/conformance',()=>({CASES:[{testId:'MCS-YIELD-1',id:'fixture'}],capturePublishedCase:mocks.capture,runConformance:mocks.run,buildWarrantBundle:mocks.bundle,adapterFor:()=>({})}))
import { probeNow } from './builder'
import { POST as probeRoute } from '../app/api/v1/builders/probe/route'
import { POST as publicTest } from '../app/api/v1/builders/test/route'
import { POST as ownerTest } from '../app/api/v1/builders/claim/test/route'
import { POST as declare } from '../app/api/v1/builders/declare/route'
const owner='0x1111111111111111111111111111111111111111'
const endpoint='https://example.org/card'
const body=(data:Record<string,unknown>)=>new NextRequest('https://candidate.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})
beforeEach(()=>{
 vi.clearAllMocks();mocks.insert.mockReturnValue({values:mocks.values});mocks.values.mockResolvedValue([])
 mocks.bundle.mockReturnValue({schema:'marque.warrant.v1',synthetic:true})
 mocks.claim.mockReturnValue({chainId:56,tokenId:'123',owner});mocks.current.mockResolvedValue(true)
 mocks.readContract.mockImplementation(async({functionName})=>functionName==='ownerOf'?owner:'data:application/json,'+encodeURIComponent(JSON.stringify({services:[{name:'a2a',endpoint}]})))
 mocks.probeService.mockResolvedValue({liveness:'unbound',latencyMs:1,statusCode:200,detail:'card readable; task acceptance unverified',executableEndpoint:'https://example.org/runtime',skills:['negotiate'],manifest:{capabilityEvidence:{cardReadable:true,endpointDiscovered:true,messageSendCallable:null}}})
})
describe('builder discovery and task mutation boundary',()=>{
 it('readable A2A discovery never sends message/send',async()=>{
  const p=await probeNow(56,'123',endpoint);expect(p.ok).toBe(false);expect(p.liveness).toBe('discovered');expect(mocks.probeA2ACall).not.toHaveBeenCalled();expect(mocks.safeFetch).not.toHaveBeenCalled();expect(mocks.probeService).toHaveBeenCalledWith('a2a',endpoint)
  expect(mocks.values.mock.calls[0]?.[0].result.discoveryOnly).toBe(true)
 })
 it('only explicit consent invokes the A2A call validator and records its actual result',async()=>{
  mocks.probeA2ACall.mockResolvedValue({ok:true,liveness:'live',latencyMs:2,statusCode:200,detail:'message/send validated (message)',executableEndpoint:'https://example.org/runtime',skills:['health']})
  const r=await probeRoute(body({chainId:56,tokenId:'123',endpoint,taskConsent:true}));expect(r.status).toBe(200);expect(await r.json()).toMatchObject({ok:true,liveness:'callable',discoveryOnly:false});expect(mocks.probeA2ACall).toHaveBeenCalledWith(endpoint);expect(mocks.probeService).not.toHaveBeenCalled();expect(mocks.values.mock.calls[0]?.[0].result).toMatchObject({callability:'ACCEPTED',discoveryOnly:false})
 })
 it('undeclared endpoint is refused before discovery or observation write',async()=>{
  await expect(probeNow(56,'123','https://other.example/card')).rejects.toThrow('declared');expect(mocks.probeService).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled()
 })
 it('reports a nonmatching declared endpoint as a fixable client error without probing it',async()=>{
  const r=await probeRoute(body({chainId:56,tokenId:'123',endpoint:'https://other.example/card'}));expect(r.status).toBe(422);expect((await r.json()).error).toBe('endpoint_mismatch');expect(mocks.probeService).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled()
 })
 it.each([false,undefined])('public task requires explicit consent %s',async taskConsent=>{
  const r=await publicTest(body({endpoint,testId:'MCS-YIELD-1',taskConsent}));expect(r.status).toBe(428);expect(mocks.capture).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled()
 })
 it('consented public test runs the existing harness without a wallet or payment header',async()=>{
  mocks.capture.mockResolvedValue({testCase:{id:'synthetic-case'}})
  mocks.run.mockResolvedValue({testId:'MCS-YIELD-1',pass:false,error:'payment required',latencyMs:1,caseId:'synthetic-case',blockNumber:'123',diffs:[]})
  const r=await publicTest(body({endpoint,testId:'MCS-YIELD-1',taskConsent:true}));expect(r.status).toBe(200);const data=await r.json();expect(data.error).toBe('payment required');expect(data.warrant.schema).toBe('marque.warrant.v1');expect(mocks.bundle).toHaveBeenCalledTimes(1);expect(mocks.run).toHaveBeenCalledTimes(1);expect(mocks.insert).not.toHaveBeenCalled()
 })
 it('owner test rejects old/unauthorized tokens before capture',async()=>{
  mocks.claim.mockReturnValue(null);expect((await ownerTest(body({claimToken:'invalid',endpoint,testId:'MCS-YIELD-1',taskConsent:true}))).status).toBe(401);expect(mocks.capture).not.toHaveBeenCalled()
 })
 it('owner transfer rejects public-record task and category mutation',async()=>{
  mocks.readContract.mockResolvedValue('0x2222222222222222222222222222222222222222');mocks.current.mockResolvedValue(false)
  expect((await ownerTest(body({claimToken:'fixture',endpoint,testId:'MCS-YIELD-1',taskConsent:true}))).status).toBe(403)
  expect((await declare(body({claimToken:'fixture',category:'yield'}))).status).toBe(403);expect(mocks.capture).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled()
 })
 it('current owner cannot test an undeclared endpoint under this identity',async()=>{
  expect((await ownerTest(body({claimToken:'fixture',endpoint:'https://other.example/card',testId:'MCS-YIELD-1',taskConsent:true}))).status).toBe(422);expect(mocks.run).not.toHaveBeenCalled()
 })
 it('RPC errors fail closed with no task or write',async()=>{
  mocks.readContract.mockRejectedValue(new Error('offline'));mocks.current.mockRejectedValue(new Error('offline'))
  expect((await ownerTest(body({claimToken:'fixture',endpoint,testId:'MCS-YIELD-1',taskConsent:true}))).status).toBe(503)
  expect((await declare(body({claimToken:'fixture',category:'yield'}))).status).toBe(503);expect(mocks.run).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled()
 })
})
