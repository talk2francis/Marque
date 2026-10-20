import { describe, expect, it } from 'vitest'
import { builderCallability } from './builder-callability'
const a='https://example.org/card', b='https://example.org/mcp'
const success={kind:'probe',endpoint:a,ok:true,result:{},checked_at:'2026-10-20T09:00:00Z'}
describe('builder call evidence remains service-bound',()=>{
  it('does not treat untested discovery as failure or as new success',()=>{
    const result=builderCallability([{endpoint:a}], [{kind:'probe',endpoint:a,ok:false,result:{discoveryOnly:true,executableEndpoint:'https://example.org/runtime',detail:'card readable; task endpoint discovered; message/send not validated'},checked_at:'2026-10-20T10:00:00Z'},success],[])
    expect(result.callable?.at).toBe('2026-10-20T09:00:00.000Z');expect(result.lastFailure).toBeNull()
  })
  it('does not borrow evidence from a previously declared endpoint',()=>{
    expect(builderCallability([{endpoint:b}],[success],[]).callable).toBeNull()
  })
  it('a new runtime failure invalidates the same service',()=>{
    const result=builderCallability([{endpoint:a}],[success], [{declared_endpoint:a,liveness:'dead',checked_at:'2026-10-20T10:00:00Z',detail:'HTTP 503'}])
    expect(result.lastFailure?.reason).toBe('HTTP 503')
  })
  it('another failing service cannot invalidate an answering A2A service',()=>{
    const result=builderCallability([{endpoint:a},{endpoint:b}],[success], [{declared_endpoint:b,liveness:'bad_schema',checked_at:'2026-10-20T10:00:00Z'}])
    expect(result.callable?.endpoint).toBe(a);expect(result.lastFailure).toBeNull()
  })
  it('discovery alone leaves callability unknown',()=>{
    expect(builderCallability([{endpoint:a}],[], [{declared_endpoint:a,liveness:'discovered',checked_at:'2026-10-20T10:00:00Z'}])).toEqual({callable:null,lastFailure:null,callabilityUnknown:true})
  })
})
