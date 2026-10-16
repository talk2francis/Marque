import { describe, expect, it } from 'vitest'
import { notificationAcceptance } from './notification'
describe('explicit notification acknowledgement', () => {
  it.each([{accepted:true}, {status:'accepted',job_id:123}, {result:{kind:'message',parts:[{kind:'text',text:'{"accepted":true,"job_id":123}'}]}}])('accepts an explicit response for the selected job', body => { expect(notificationAcceptance(JSON.stringify(body),'123')).toBe('accepted') })
  it.each([{status:'rejected',job_id:123}, {accepted:false,jobId:123}, {result:{parts:[{data:{accepted:true}},{data:{accepted:false}}]}}])('keeps explicit rejection negative even when jobId is present', body => { expect(notificationAcceptance(JSON.stringify(body),'123')).toBe('rejected') })
  it.each([{job_id:123},{error:{message:'job_id 123 accepted true'}},{result:{accepted:true,job_id:999}},{result:{error:{accepted:true}}},null,[]])('never infers acceptance from errors, bare job IDs or another job', body => { expect(notificationAcceptance(JSON.stringify(body),'123')).toBeNull() })
  it('rejects malformed JSON and prose', () => { expect(notificationAcceptance('accepted job_id123','123')).toBeNull() })
})
