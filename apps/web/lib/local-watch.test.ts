import { afterEach, expect, it, vi } from 'vitest'
import { firedAlerts, hireLimit, savedAgents, watched } from './local-watch'
afterEach(() => vi.unstubAllGlobals())
it('ignores malformed device entries without clearing or rewriting saved data', () => {
  const store = new Map<string,string>(), setItem = vi.fn()
  vi.stubGlobal('localStorage', {getItem:(key:string)=>store.get(key) ?? null,setItem})
  store.set('marque:watching:v1', JSON.stringify([null,{}, {address:{toString:'bad'}}, {address:'0x'+'a'.repeat(40),hfBelow:2,lpNearPct:5,idle:false,addedAt:'2026-11-06'}]))
  store.set('marque:saved-agents:v1', JSON.stringify([false,{}, {agentId:'id',name:'A',chainId:56,tokenId:'1',savedAt:'2026-11-06'}]))
  store.set('marque:watch-fired:v1', '{bad json')
  store.set('marque:hire-limit:v1', '"not money"')
  expect(watched()).toHaveLength(1); expect(savedAgents()).toHaveLength(1); expect(firedAlerts()).toEqual([]); expect(hireLimit()).toBeNull()
  store.set('marque:watch-fired:v1', '[null,"a",{}]'); expect(firedAlerts()).toEqual(['a']); expect(setItem).not.toHaveBeenCalled()
})
