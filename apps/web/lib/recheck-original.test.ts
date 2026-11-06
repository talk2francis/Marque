import{expect,it,vi}from'vitest'
import{originalAnswerCache}from'./recheck-original'
import type{Manifest}from'./manifest'
const hash='0x'+'1'.repeat(64),changed='0x'+'2'.repeat(64)
const answer=(h=hash):Manifest=>({raw:'{"healthFactor":2}',hash:h as `0x${string}`,matches:true,content:{healthFactor:2},pretty:'{}'})
it('reuses only verified immutable bytes for the same expected commitment and expires its cache',async()=>{
 const read=originalAnswerCache(),load=vi.fn(async()=>answer()),at=1000
 await read('56:1:provider:'+hash,hash,load,()=>at);await read('56:1:provider:'+hash,hash,load,()=>at+10)
 expect(load).toHaveBeenCalledTimes(1)
 await read('56:1:provider:'+hash,hash,load,()=>at+600001);expect(load).toHaveBeenCalledTimes(2)
 await read('56:1:provider:'+changed,changed,async()=>answer(changed),()=>at);expect(load).toHaveBeenCalledTimes(2)
})
it('never caches an unverified, mismatched or oversized answer',async()=>{
 for(const bad of[{...answer(),matches:null},{...answer(),hash:changed as `0x${string}`},{...answer(),raw:'x'.repeat(512*1024+1)}]){
  const read=originalAnswerCache(),load=vi.fn(async()=>bad)
  expect(await read('key',hash,load)).toBeNull();expect(await read('key',hash,load)).toBeNull();expect(load).toHaveBeenCalledTimes(2)
 }
})
it('bounds retained records and coalesces an identical pending read',async()=>{
 const read=originalAnswerCache();let done:(v:Manifest)=>void=()=>{}
 const load=vi.fn(()=>new Promise<Manifest>(resolve=>{done=resolve}))
 const first=read('shared',hash,load),second=read('shared',hash,load);done(answer());await Promise.all([first,second]);expect(load).toHaveBeenCalledTimes(1)
 for(let i=0;i<17;i++)await read(String(i),hash,async()=>answer())
 const evicted=read('shared',hash,load);expect(load).toHaveBeenCalledTimes(2);done(answer());await evicted
})

it('binds pending reads to the expected hash and does not let callers mutate retained verified content',async()=>{
 const read=originalAnswerCache(),first=await read('same job',hash,async()=>answer())
 first!.content!.healthFactor=900
 expect((await read('same job',hash,async()=>answer()))?.content?.healthFactor).toBe(2)
 expect((await read('same job',changed,async()=>answer(changed)))?.hash).toBe(changed)
 const load=vi.fn(async()=>answer());expect(await read('no hash',null,load)).toBeNull();expect(load).not.toHaveBeenCalled()
})
