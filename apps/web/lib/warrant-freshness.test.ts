import {expect,it} from 'vitest'
import {WARRANT_DAYS} from './standing'
import {warrantDueAt,warrantIsStale} from './warrant-freshness'
it('uses the existing standing window instead of confusing refresh cadence with expiry',()=>{
 const at='2026-11-03T08:35:14.000Z',start=Date.parse(at)
 expect(WARRANT_DAYS).toBe(14)
 expect(warrantIsStale(at,start+73*3600000)).toBe(false)
 expect(warrantIsStale(at,start+14*86400000)).toBe(false)
 expect(warrantIsStale(at,start+14*86400000+1)).toBe(true)
 expect(warrantDueAt(at)).toBe(start+WARRANT_DAYS*86400000)
 expect(warrantDueAt('not a date')).toBeNull();expect(warrantDueAt(null)).toBeNull()
})
