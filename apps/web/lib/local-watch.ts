'use client'
/**
 * Saved agents and watched positions (SPEC-WORKSPACE 1.7). Per viewer, in localStorage, wrapped so a
 * private window or blocked storage never breaks a page. Labelled "Saved on this device" wherever shown.
 */
export interface SavedAgent { agentId: string; name: string; chainId: number; tokenId: string | null; savedAt: string }
export interface WatchedPosition { address: string; hfBelow: number | null; lpNearPct: number | null; idle: boolean; addedAt: string }

const K = { saved: 'marque:saved-agents:v1', watch: 'marque:watching:v1', limit: 'marque:hire-limit:v1', fired: 'marque:watch-fired:v1' }
export const SAVED_EVENT = 'marque:saved-agents'
export const WATCH_EVENT = 'marque:watching'

function read<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback } }
function write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const finiteOrNull = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v)

export const savedAgents = (): SavedAgent[] => {
  const value = read<unknown>(K.saved, [])
  return Array.isArray(value) ? (value as unknown[]).filter((v): v is SavedAgent => record(v) && typeof v.agentId === 'string' && typeof v.name === 'string' && (v.chainId === 56 || v.chainId === 97) && (v.tokenId === null || typeof v.tokenId === 'string' && /^\d{1,30}$/.test(v.tokenId)) && typeof v.savedAt === 'string') : []
}
export const isSaved = (agentId: string) => savedAgents().some((a) => a.agentId === agentId)
export function toggleSaved(a: Omit<SavedAgent, 'savedAt'>): boolean {
  const list = savedAgents()
  const on = !list.some((x) => x.agentId === a.agentId)
  write(K.saved, on ? [{ ...a, savedAt: new Date().toISOString() }, ...list].slice(0, 60) : list.filter((x) => x.agentId !== a.agentId))
  try { window.dispatchEvent(new CustomEvent(SAVED_EVENT)) } catch { /* no window */ }
  return on
}

export const watched = (): WatchedPosition[] => {
  const value = read<unknown>(K.watch, [])
  return Array.isArray(value) ? (value as unknown[]).filter((v): v is WatchedPosition => record(v) && typeof v.address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.address) && finiteOrNull(v.hfBelow) && finiteOrNull(v.lpNearPct) && typeof v.idle === 'boolean' && typeof v.addedAt === 'string') : []
}
export function saveWatched(list: WatchedPosition[]) { write(K.watch, list.slice(0, 12)); try { window.dispatchEvent(new CustomEvent(WATCH_EVENT)) } catch { /* no browser */ } }

/** "Ask me twice before any single hire above X": a reminder on this device, not a lock on chain. */
export const hireLimit = (): number | null => { const value = read<unknown>(K.limit, null); return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null }
export const setHireLimit = (v: number | null) => write(K.limit, v)

export const firedAlerts = (): string[] => { const value = read<unknown>(K.fired, []); return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [] }
export const markFired = (key: string) => write(K.fired, [...firedAlerts(), key].slice(-100))
