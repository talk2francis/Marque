import { beforeEach, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({cache:vi.fn()}))
vi.mock('@marque/db',async original=>({...await original<typeof import('@marque/db')>(),cachedProjection:mock.cache}))
import { agentTrack, agentTracks, trackFromSource, EMPTY_TRACK } from './agent-track'
beforeEach(()=>vi.resetAllMocks())
it('a failed index read is unavailable, not an empty successful track record',async()=>{
  mock.cache.mockRejectedValue(new Error('synthetic query timeout'))
  expect(await agentTracks()).toBeNull()
  expect(await agentTrack('1')).toMatchObject({available:false,computedAt:null})
})
it('a successful empty subset retains its actual source timestamp and stale state',async()=>{
  const at='2026-10-17T00:00:00.000Z'
  mock.cache.mockResolvedValue({value:{},computedAt:at,stale:true})
  expect(await agentTrack('1')).toMatchObject({available:true,computedAt:at,sourceStale:true,verified:{count:0,averageStars:null}})
})
it('market cards and storefronts use the same state distinction without mutating cached history',()=>{
  const original=EMPTY_TRACK(56),source={tracks:{'1':original},computedAt:'2026-10-17T00:00:00.000Z',stale:false}
  expect(trackFromSource('1',56,source)).toMatchObject({available:true,computedAt:source.computedAt})
  expect(original.computedAt).toBeNull()
  expect(trackFromSource('1',56,null).available).toBe(false)
})
