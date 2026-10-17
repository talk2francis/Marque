import { beforeEach, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const mocks=vi.hoisted(()=>({ratings:vi.fn(),served:vi.fn(),execute:vi.fn()}))
vi.mock('@marque/db',async original=>({...await original<typeof import('@marque/db')>(),db:()=>({execute:mocks.execute})}))
vi.mock('@marque/commerce',async original=>({...await original<typeof import('@marque/commerce')>(),agentRatings:mocks.ratings}))
vi.mock('../../../../../../lib/phase2-api',async original=>({...await original<typeof import('../../../../../../lib/phase2-api')>(),served:mocks.served}))
import { GET } from './route'
beforeEach(()=>{
  vi.resetAllMocks();mocks.execute.mockResolvedValue([{id:'exact',name:'Synthetic outside',agent_wallet:'0x'+'1'.repeat(40)}])
  mocks.ratings.mockImplementation(async(chainId,agentId,_wallet,options)=>({chainId,agentId,verifiedBuyers:{count:0,averageStars:null},allFeedback:{count:0,starredCount:0,averageStars:null},...(options.evidence?{evidence:{schema:'marque.rating-evidence.v1'}}:{})}))
  mocks.served.mockImplementation(async(_key,_name,build)=>NextResponse.json(await build()))
})
const call=(suffix='',agentId='999999999999')=>GET(new Request('https://candidate.invalid/api/v1/phase2/ratings/'+agentId+suffix),{params:Promise.resolve({agentId})})
it('default ratings preserve their existing shape and explicitly invalidate old loose-binding cache',async()=>{
  const r=await (await call()).json()
  expect(Object.keys(r)).toEqual(['agentKey','name','mainnet','testnet']);expect(r.mainnet.evidence).toBeUndefined()
  expect(mocks.served.mock.calls[0]![0]).toBe('phase2:ratings-v2:999999999999')
})
it('evidence opt-in cannot reuse the default projection cache',async()=>{
  const r=await (await call('?format=evidence')).json()
  expect(r.mainnet.evidence.schema).toBe('marque.rating-evidence.v1')
  expect(mocks.served.mock.calls[0]![0]).toBe('phase2:ratings-v2:evidence:999999999999')
})
it('rejects malformed identity before SQL or projection work',async()=>{
  expect((await call('','../56')).status).toBe(400);expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.served).not.toHaveBeenCalled()
})
