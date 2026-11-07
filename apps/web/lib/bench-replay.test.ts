import {beforeEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({record:vi.fn(),checks:vi.fn(),normalize:vi.fn()}))
vi.mock('./recheck-record',()=>({recheckRecord:m.record}))
vi.mock('@marque/conformance',()=>({checksFor:m.checks,grade:vi.fn(),loadCaseById:vi.fn()}))
vi.mock('@marque/commerce',()=>({normalizeAnswer:m.normalize}))
vi.mock('./job-description',()=>({onchainJobTask:async()=>({task:'original task'})}))
import {replaySuppliedAnswer} from './bench-replay'
beforeEach(()=>{vi.resetAllMocks();m.record.mockResolvedValue({block:'100',category:'health_factor',job:{provider:'recorded provider'}});m.normalize.mockReturnValue({kind:'health_factor',meta:{block:'100'}});m.checks.mockResolvedValue([])})
it('never grades a supplied answer against a different recorded block',async()=>{
 m.normalize.mockReturnValue({meta:{block:'101'}});await expect(replaySuppliedAnswer({chainId:56,jobId:'1'},{})).rejects.toThrow('block_mismatch');expect(m.checks).not.toHaveBeenCalled()
})
it('uses the exact job binding and passes its original block to existing checks',async()=>{
 await replaySuppliedAnswer({chainId:56,jobId:'1'},{});expect(m.checks).toHaveBeenCalledWith(expect.anything(),'original task',100n)
 expect(m.record).toHaveBeenCalledWith(56,'1')
})
it.each([null,{block:'100',category:null,job:{}},{block:'100',category:'health_factor',job:null}])('cannot grade a missing or unattributed original job',async(record)=>{
 m.record.mockResolvedValue(record);await expect(replaySuppliedAnswer({chainId:56,jobId:'1'},{})).rejects.toThrow();expect(m.checks).not.toHaveBeenCalled()
})
