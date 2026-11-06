import {beforeEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({execute:vi.fn(),checks:vi.fn(),normalize:vi.fn(),job:vi.fn()}))
vi.mock('@marque/db',()=>({db:()=>({transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn({execute:m.execute})})}))
vi.mock('@marque/conformance',()=>({checksFor:m.checks,grade:vi.fn(),loadCaseById:vi.fn()}))
vi.mock('@marque/commerce',()=>({normalizeAnswer:m.normalize,questJob:m.job}))
vi.mock('./job-description',()=>({onchainJobTask:async()=>({task:'original task'})}))
import {replaySuppliedAnswer} from './bench-replay'
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([{block:'100'}]);m.job.mockResolvedValue({agent:{category:'health_factor'}});m.normalize.mockReturnValue({kind:'health_factor',meta:{block:'100'}});m.checks.mockResolvedValue([])})
it('never grades a supplied answer against a different recorded block',async()=>{
 m.normalize.mockReturnValue({meta:{block:'101'}});await expect(replaySuppliedAnswer({chainId:56,jobId:'1'},{})).rejects.toThrow('block_mismatch');expect(m.checks).not.toHaveBeenCalled()
})
it('passes the original block to existing checks and only issues read-only database statements',async()=>{
 await replaySuppliedAnswer({chainId:56,jobId:'1'},{});expect(m.checks).toHaveBeenCalledWith(expect.anything(),'original task',100n)
 const {PgDialect}=await import('drizzle-orm/pg-core');const dialect=new PgDialect()
 const statements=m.execute.mock.calls.map(([q])=>dialect.sqlToQuery(q).sql)
 expect(statements).toHaveLength(3);expect(statements[0]).toContain('read only');expect(statements[2]).toMatch(/^select block/);expect(statements.join(' ')).not.toMatch(/\b(insert|update|delete)\b/i)
})
