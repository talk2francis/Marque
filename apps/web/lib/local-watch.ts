'use client'
/**
 * Saved agents and watched positions (SPEC-WORKSPACE 1.7). Per viewer, in localStorage, wrapped so a
 * private window or blocked storage never breaks a page. Labelled "Saved on this device" wherever shown.
 */
export interface SavedAgent { agentId: string; name: string; chainId: number; tokenId: string | null; savedAt: string }
export interface WatchedPosition { address: string; hfBelow: number | null; lpNearPct: number | null; idle: boolean; addedAt: string }

const K = { saved: 'marque:saved-agents:v1', watch: 'marque:watching:v1', limit: 'marque:hire-limit:v1', fired: 'marque:watch-fired:v1' }
export const SAVED_EVENT = 'marque:saved-agents'

function read<T>(k: string, fallback: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback } }
function write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }

export const savedAgents = (): SavedAgent[] => read<SavedAgent[]>(K.saved, [])
export const isSaved = (agentId: string) => savedAgents().some((a) => a.agentId === agentId)
export function toggleSaved(a: Omit<SavedAgent, 'savedAt'>): boolean {
  const list = savedAgents()
  const on = !list.some((x) => x.agentId === a.agentId)
  write(K.saved, on ? [{ ...a, savedAt: new Date().toISOString() }, ...list].slice(0, 60) : list.filter((x) => x.agentId !== a.agentId))
  try { window.dispatchEvent(new CustomEvent(SAVED_EVENT)) } catch { /* no window */ }
  return on
}

export const watched = (): WatchedPosition[] => read<WatchedPosition[]>(K.watch, [])
export function saveWatched(list: WatchedPosition[]) { write(K.watch, list.slice(0, 12)) }

/** "Ask me twice before any single hire above X": a reminder on this device, not a lock on chain. */
export const hireLimit = (): number | null => read<number | null>(K.limit, null)
export const setHireLimit = (v: number | null) => write(K.limit, v)

export const firedAlerts = (): string[] => read<string[]>(K.fired, [])
export const markFired = (key: string) => write(K.fired, [...firedAlerts(), key].slice(-100))
