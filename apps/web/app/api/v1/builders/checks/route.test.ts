import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m=vi.hoisted(()=>({claim:vi.fn(),view:vi.fn(),seller:vi.fn(),demand:vi.fn()}))
vi.mock('../../../../../lib/claim',()=>({readClaimToken:m.claim}))
vi.mock('../../../../../lib/builder',()=>({builderIdentities:async()=>[],builderView:m.view}))
vi.mock('../../../../../lib/seller',()=>({sellerProjection:m.seller}))
vi.mock('../../../../../lib/builder-demand-data',()=>({builderDemand:m.demand}))
import { GET } from './route'
const owner='0x'+'1'.repeat(40),agentKey='56:0x'+'2'.repeat(40)+':123'
const req=(auth?:string,wallet=owner,token='123')=>new NextRequest(`https://example.invalid/api/v1/builders/checks?wallet=${wallet}&chainId=56&tokenId=${token}&report=demand`,{headers:auth?{authorization:auth}:{}})
beforeEach(()=>{vi.resetAllMocks();m.claim.mockReturnValue({owner,chainId:56,tokenId:'123'});m.view.mockResolvedValue({identity:{agentKey}});m.seller.mockResolvedValue({diagnostics:{}});m.demand.mockResolvedValue({rows:[]})})
it('denies absent, expired and mismatched proofs before private demand is read',async()=>{
  expect((await GET(req())).status).toBe(403)
  m.claim.mockReturnValueOnce(null);expect((await GET(req('Bearer expired'))).status).toBe(401)
  expect((await GET(req('Bearer owner','0x'+'3'.repeat(40)))).status).toBe(403)
  expect((await GET(req('Bearer owner',owner,'124'))).status).toBe(403)
  expect(m.demand).not.toHaveBeenCalled();expect(m.view).not.toHaveBeenCalled()
})
it('a formerly valid claim cannot read demand after current ownership verification fails',async()=>{
  m.seller.mockRejectedValue(new Error('seller_owner_unverified'))
  const r=await GET(req('Bearer owner'));expect(r.status).toBe(403);expect(r.headers.get('cache-control')).toBe('no-store');expect(m.demand).not.toHaveBeenCalled()
})
it('only reads demand after current ownership is rechecked and forbids response caching',async()=>{
  const r=await GET(req('Bearer owner'));expect(r.status).toBe(200);expect(m.seller).toHaveBeenCalledWith({identity:{agentKey}},owner);expect(m.demand).toHaveBeenCalledWith(agentKey,0);expect(r.headers.get('cache-control')).toBe('no-store');expect(r.headers.get('vary')).toContain('Authorization')
})
