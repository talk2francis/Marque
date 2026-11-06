import { beforeEach, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({replay:vi.fn(),limit:vi.fn()}))
vi.mock('../../../../../../lib/bench-replay',()=>({replaySuppliedAnswer:m.replay}))
vi.mock('../../../../../../lib/limits',()=>({checkWindow:m.limit,clientKey:()=> 'fixture'}))
import { POST } from './route'
const req=(body:unknown)=>new Request('https://example.invalid/api/v1/builders/bench/replay',{method:'POST',body:JSON.stringify(body)})
const body={consent:true,target:{chainId:56,jobId:'10'},answer:{healthFactor:2}}
beforeEach(()=>{vi.resetAllMocks();m.limit.mockReturnValue({ok:true})})
it('requires consent and rejects endpoint or payment fields before replay',async()=>{
  expect((await POST(req({...body,consent:false}))).status).toBe(428)
  for(const extra of [{endpoint:'https://example.org'},{payment:true},{target:{chainId:1,jobId:'1'}}])expect((await POST(req({...body,...extra}))).status).toBe(400)
  expect(m.replay).not.toHaveBeenCalled()
})
it('does not run oversized or rate-limited replays',async()=>{
  expect((await POST(req({...body,answer:'a'.repeat(32769)}))).status).toBe(413)
  m.limit.mockReturnValue({ok:false});expect((await POST(req(body))).status).toBe(429);expect(m.replay).not.toHaveBeenCalled()
})
it('refuses a different block and returns no invented successful result',async()=>{
  m.replay.mockRejectedValue(new Error('block_mismatch'));expect((await POST(req(body))).status).toBe(422)
  m.replay.mockRejectedValue(new Error('archive private details'));const r=await POST(req(body));expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('archive private details')
})
it('returns only validated supplied-answer differences at the original block',async()=>{
  m.replay.mockResolvedValue({kind:'job',at:'2026-11-06T07:00:00Z',block:'123',source:'56:10',rows:[{field:'hf',label:'Health factor',actual:'2',expected:'2.1',pass:false,detail:'Original block.'}]})
  const r=await POST(req(body));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(m.replay).toHaveBeenCalledWith(body.target,body.answer)
})
