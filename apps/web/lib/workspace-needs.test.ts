import {beforeEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({allowance:vi.fn(),window:vi.fn()}))
vi.mock('@marque/db',()=>({db:()=>({execute:async()=>[]})}))
vi.mock('@marque/commerce',()=>({chainClient:()=>({multicall:m.allowance}),disputeWindowSeconds:m.window,teamWallets:()=>[],questFor:vi.fn(),network:()=>({commerce:'0x'+'2'.repeat(40)}),NETWORKS:{56:{assets:[{address:'0x'+'1'.repeat(40),symbol:'U',decimals:18}]},97:{assets:[{address:'0x'+'1'.repeat(40),symbol:'U',decimals:18}]}}}))
import {needsYou} from './workspace'
beforeEach(()=>{vi.resetAllMocks();m.allowance.mockResolvedValue([{status:'success',result:0n}]);m.window.mockResolvedValue(604800)})
it('distinguishes an actual empty action list from failed allowance or review-window reads',async()=>{
 expect(await needsYou('0x'+'3'.repeat(40))).toMatchObject({items:[],partial:false})
 m.allowance.mockRejectedValueOnce(new Error('unavailable'));expect(await needsYou('0x'+'3'.repeat(40))).toMatchObject({items:[],partial:true})
 m.window.mockRejectedValueOnce(new Error('unavailable'));expect(await needsYou('0x'+'3'.repeat(40))).toMatchObject({items:[],partial:true})
})
