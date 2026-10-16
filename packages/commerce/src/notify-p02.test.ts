import { beforeEach, describe, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ status: 1, selected: 0, fetch: vi.fn(), inserted: vi.fn() }))
vi.mock('@marque/db', async original => ({ ...await original<object>(), db: () => ({
  select: () => { const index = f.selected++; const value = index===0?[{id:'fixture',quoteId:1}]:index===1?[]:index===2?[{endpoint:'https://example.org/a2a'}]:[{n:0}]; const query = { limit: async()=>value, orderBy:()=>query, then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(value).then(resolve) }; return {from:()=>({where:()=>query})} },
  insert:()=>({values: async(value:unknown)=>{f.inserted(value)}}), update:()=>({set:()=>({where:async()=>[]})}),
}) }))
vi.mock('./chain', async original => ({ ...await original<object>(), chainClient:()=>({readContract:async()=>({status:f.status})}) }))
vi.mock('@marque/probe', async original => ({ ...await original<object>(), safeFetch:f.fetch }))
import { notifySeller } from './hire'
beforeEach(()=>{f.status=1;f.selected=0;vi.clearAllMocks();f.fetch.mockResolvedValue({ok:true,status:200,body:'{"accepted":true}'})})
describe('funded notification truth',()=>{
 it.each([0,4,5])('does not invoke a task for non-funded status %s',async status=>{f.status=status;await expect(notifySeller(56,'123')).rejects.toMatchObject({code:'not_funded'});expect(f.fetch).not.toHaveBeenCalled()})
 it.each([2,3])('does not repeat a delivered job at status %s',async status=>{f.status=status;expect(await notifySeller(56,'123')).toMatchObject({status:'already_delivered',attempts:0});expect(f.fetch).not.toHaveBeenCalled()})
 it('a rejected response mentioning job_id remains rejected and is not retried',async()=>{f.fetch.mockResolvedValue({ok:true,status:200,body:'{"status":"rejected","job_id":123}'});expect(await notifySeller(56,'123')).toMatchObject({accepted:false,status:'rejected',attempts:1});expect(f.fetch).toHaveBeenCalledTimes(1);expect(f.inserted.mock.calls[0]![0]).toMatchObject({ok:false,status:'rejected'})})
 it('caller parameters cannot redirect the task or funded job identity',async()=>{await notifySeller(56,'123',{params:{skill:'trade',job_id:999,example:'retained'}});const body=JSON.parse(f.fetch.mock.calls[0]![1].body);expect(body.params.message.parts[0].data).toEqual({skill:'notify_funded',job_id:123,example:'retained'});expect(f.inserted).toHaveBeenCalledTimes(1)})
})
