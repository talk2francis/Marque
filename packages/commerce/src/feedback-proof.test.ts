import { expect, it } from 'vitest'
import { feedbackEvidence, feedbackIdentity, type FeedbackObservation } from './feedback-proof.js'
import { firstPartyAgents } from '@marque/db'
const a = `0x${'a'.repeat(40)}`, b = `0x${'b'.repeat(40)}`
const row = (extra: Partial<FeedbackObservation> = {}): FeedbackObservation => ({ client: a, verified: true, jobId: '10', feedbackIndex:'0', blockNumber: '90071992547409931234', at: '2026-10-17T00:00:00.000Z', tx: `0x${'1'.repeat(64)}`, ...extra })
it('separates three review records from two job keys and one address, without a human claim', () => {
  const input = [row(), row(), row({ client: a.toUpperCase(), jobId: '11' })], before = structuredClone(input)
  const r = feedbackEvidence(56, '1', input, [])
  expect(r.buyerLinked).toMatchObject({ feedbackRecords: 3, distinctWallets: 1, distinctJobs: 2, repeatedWallets: 1, repeatedJobFeedbackRecords: 1 })
  expect(r.buyerLinked.graph[0]).toMatchObject({ wallet: a, jobKeys: ['56:10','56:11'], operatorOverlap: 'UNKNOWN', humanIndependence: 'UNKNOWN', review: 'REPEATED_WALLET_PENDING_REVIEW' })
  expect(r.independentHumans).toBeNull(); expect(r.commonFunding).toBe('NOT_CHECKED')
  expect(input).toEqual(before)
  expect(r.feedbackReferences[0]).toMatchObject({client:a,feedbackIndex:'0',block:'90071992547409931234',buyerLinkedJob:'56:10'})
})
it('excludes team addresses, missing job links and unbound feedback from buyer-linked counts', () => {
  const r = feedbackEvidence(97, '1', [row(), row({ client: b }), row({ verified: false }), row({ jobId: null })], [b.toUpperCase()])
  expect(r.buyerLinked).toMatchObject({ feedbackRecords: 1, distinctWallets: 1, distinctJobs: 1 })
  expect(r.teamFeedbackRecords).toBe(1); expect(r.scope.feedbackRecords).toBe(4)
  expect(r.buyerLinked.graph[0]!.jobKeys).toEqual(['97:10'])
})
it('retains exact large block bounds and unavailable time rather than coercing to a number', () => {
  const r = feedbackEvidence(56,'1',[row({at:null}),row({blockNumber:'90071992547409931235',at:'invalid'})],[])
  expect(r.scope).toMatchObject({ blockFrom:'90071992547409931234',blockTo:'90071992547409931235',timeFrom:null,timeTo:null })
})
it('empty feedback is an explicit empty subset, not independent traction', () => {
  const r = feedbackEvidence(56,'1',[],[])
  expect(r.scope).toMatchObject({feedbackRecords:0,blockFrom:null,timeFrom:null})
  expect(r.buyerLinked.graph).toEqual([]); expect(r.independentHumans).toBeNull()
})
it('dedup ordering is deterministic without mutating observations', () => {
  const xs=[row({client:b}),row()]
  expect(feedbackEvidence(56,'1',xs,[])).toEqual(feedbackEvidence(56,'1',[...xs].reverse(),[]))
})
it('testnet identity mapping uses configured aliases only', () => {
  expect(feedbackIdentity(56,'123')).toMatch(/:123$/)
  expect(feedbackIdentity(97,'999999999999999999')).toBeNull()
  expect(feedbackIdentity(56,'1 OR true')).toBeNull()
  const first=firstPartyAgents().find(f=>f.testnet?.chainId===97)
  expect(first).toBeDefined()
  expect(feedbackIdentity(97,String(first!.testnet!.tokenId))).toMatch(new RegExp(`:${first!.tokenId}$`))
})
it('caps reference and graph payloads while keeping complete subset counts and disclosing truncation',()=>{
  const rows=Array.from({length:201},(_,i)=>row({client:`0x${(i+1).toString(16).padStart(40,'0')}`,jobId:String(i)}))
  const r=feedbackEvidence(56,'1',rows,[])
  expect(r.buyerLinked).toMatchObject({feedbackRecords:201,distinctWallets:201,distinctJobs:201,graphMoreAvailable:true})
  expect(r.buyerLinked.graph).toHaveLength(200);expect(r.feedbackReferences).toHaveLength(100);expect(r.feedbackReferencesMoreAvailable).toBe(true)
})
