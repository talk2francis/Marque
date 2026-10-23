import { describe, expect, it } from 'vitest'
import { notificationAcceptance } from './notification'
describe('explicit notification acknowledgement', () => {
  it.each([{accepted:true}, {status:'accepted',job_id:123}, {result:{kind:'message',parts:[{kind:'text',text:'{"accepted":true,"job_id":123}'}]}}])('accepts an explicit response for the selected job', body => { expect(notificationAcceptance(JSON.stringify(body),'123')).toBe('accepted') })
  it.each([{status:'rejected',job_id:123}, {accepted:false,jobId:123}, {result:{parts:[{data:{accepted:true}},{data:{accepted:false}}]}}])('keeps explicit rejection negative even when jobId is present', body => { expect(notificationAcceptance(JSON.stringify(body),'123')).toBe('rejected') })
  it.each([{job_id:123},{error:{message:'job_id 123 accepted true'}},{result:{accepted:true,job_id:999}},{result:{error:{accepted:true}}},null,[]])('never infers acceptance from errors, bare job IDs or another job', body => { expect(notificationAcceptance(JSON.stringify(body),'123')).toBeNull() })
  it('rejects malformed JSON and prose', () => { expect(notificationAcceptance('accepted job_id123','123')).toBeNull() })
})

describe('receipts sellers actually send (V4 staging, 23 Oct)', () => {
  it('accepts {received: true} with the job id and {ok: true} with the job id', () => {
    const mandate = { jsonrpc: '2.0', result: { kind: 'message', parts: [{ kind: 'data', data: { received: true, job_id: 1642, deliverable_url: 'https://www.mandatemarkets.com/api/escrow/testnet/jobs/1642/deliverable' } }] } }
    expect(notificationAcceptance(JSON.stringify(mandate), '1642')).toBe('accepted')
    expect(notificationAcceptance(JSON.stringify({ result: { ok: true, job_id: 1630 } }), '1630')).toBe('accepted')
  })
  it('a bare ok without the job id, or a receipt for another job, is not acceptance', () => {
    expect(notificationAcceptance(JSON.stringify({ result: { ok: true } }), '1630')).toBeNull()
    expect(notificationAcceptance(JSON.stringify({ result: { received: true, job_id: 9 } }), '1630')).toBeNull()
  })
})
