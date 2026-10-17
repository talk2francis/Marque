import { expect, it } from 'vitest'
import { ledgerOutcomeReferences } from './outcome-links'
const at='2026-10-17T00:00:00.000Z'
const row=()=>({id:1,benchmarkId:'historical',jobId:null,chainId:null,receiptId:null,block:'0',at})
it('does not infer a commercial outcome or pre/post return from a measured run',()=>{
  const input=[row()],before=structuredClone(input),r=ledgerOutcomeReferences(input,at)
  expect(r).toMatchObject({state:'UNAVAILABLE',verifiedReceiptLinkedOutcome:null,roi:null,drawdown:null})
  expect(r.records[0]).toMatchObject({jobUrl:null,receiptUrl:null,prePostMeasurement:'UNKNOWN',blockContext:'NOT_RECORDED'})
  expect(input).toEqual(before)
})
it('a real-looking reference stays unverified, and missing chain cannot create a job URL',()=>{
  const r=ledgerOutcomeReferences([{...row(),jobId:'56916',block:'127719379'}, {...row(),id:2,chainId:56,jobId:'56916',receiptId:'944bea48-7c7e-4afc-aa93-fbe126772362'}],at)
  expect(r.state).toBe('REFERENCES_REQUIRE_VERIFICATION');expect(r.verifiedReceiptLinkedOutcome).toBeNull()
  expect(r.records[0]).toMatchObject({jobUrl:null,state:'EXPLICIT_REFERENCE_UNVERIFIED'})
  expect(r.records[1]).toMatchObject({jobUrl:'/jobs/56/56916',receiptUrl:'/receipts/944bea48-7c7e-4afc-aa93-fbe126772362',linkVerification:'NOT_PERFORMED'})
})
it('rejects malformed or oversized reference metadata without rendering hostile links',()=>{
  const r=ledgerOutcomeReferences([{...row(),jobId:'https://evil.invalid'}, {...row(),receiptId:'javascript:alert(1)'}, {...row(),chainId:1}, {...row(),at:'invalid'}],at)
  expect(r.scope).toMatchObject({returnedRecords:0,invalidRecords:4});expect(r.records).toEqual([])
  expect(r.rejectedRecords.map(r=>r.position)).toEqual([0,1,2,3])
})
it('a query cap is disclosed as returned metadata, never a population',()=>{
  const r=ledgerOutcomeReferences(Array.from({length:201},(_,i)=>({...row(),id:i+1})),at)
  expect(r.scope).toEqual({returnedRecords:200,invalidRecords:0,moreAvailable:true,limit:200})
})
