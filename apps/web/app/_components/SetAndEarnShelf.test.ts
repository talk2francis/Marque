import * as React from 'react'
import{afterEach,beforeEach,expect,it,vi}from'vitest'
import{renderToStaticMarkup}from'react-dom/server'
const m=vi.hoisted(()=>({read:vi.fn()}))
vi.mock('../../lib/set-and-earn-shelf',()=>({setAndEarnShelf:m.read}))
vi.mock('@marque/commerce/rules',()=>({campaignClock:()=>({closed:true})}))
import{SetAndEarnShelf}from'./SetAndEarnShelf'
const agents=Array.from({length:5},(_,i)=>({agentId:`agent-${i}`,chainId:56,tokenId:String(i),name:`Example ${i}`,category:'yield',registeredAt:'2026-10-02T00:00:00Z',hirers:1,needs:2,passed:true,live:false,reason:'No current price'}))
beforeEach(()=>{vi.stubGlobal('React',React);m.read.mockResolvedValue({agents,measuredAt:'2026-11-06T08:00:00Z',since:'2026-10-01T00:00:00Z',required:3})})
afterEach(()=>vi.unstubAllGlobals())
it('keeps the complete directory on the campaign page and stops asking for hires after the close',async()=>{
 const html=renderToStaticMarkup(await SetAndEarnShelf({}))
 for(const a of agents)expect(html).toContain(a.name)
 expect(html).not.toContain('Needs 2 more');expect(html).toContain('frozen eligibility record');expect(html).toContain('New hires after the close do not change campaign eligibility')
})
it('gives Forge a bounded set of examples with the full-directory link and no repeated hire checklist',async()=>{
 const html=renderToStaticMarkup(await SetAndEarnShelf({compact:true,id:'forge-examples'}))
 expect(html).toContain('Example 2');expect(html).not.toContain('Example 3');expect(html).toContain('/quest#built-during');expect(html).not.toContain('completed hires');expect(agents).toHaveLength(5)
})
