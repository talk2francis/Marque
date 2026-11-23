'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * Agents an owner chose to hide from My Marque (23 Nov 2026), per wallet, on this device. An ERC-8004 identity cannot be
 * deleted (it stays registered to the wallet on chain); hiding only tidies the owner's own workspace and changes nothing
 * public: the agent stays registered, listed and checked as before.
 */
const keyOf = (owner: string) => `marque:hidden-agents:${owner.toLowerCase()}`

function read(owner: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(keyOf(owner)) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : []
  } catch { return [] }
}

export function useHiddenAgents(owner: string | null | undefined) {
  const [hidden, setHidden] = useState<string[]>([])
  useEffect(() => { setHidden(owner ? read(owner) : []) }, [owner])
  useEffect(() => {
    if (!owner) return
    const on = (e: StorageEvent) => { if (e.key === keyOf(owner)) setHidden(read(owner)) }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [owner])
  const set = useCallback((agentKey: string, hide: boolean) => {
    if (!owner) return
    const next = hide ? [...new Set([...read(owner), agentKey])] : read(owner).filter((k) => k !== agentKey)
    try { localStorage.setItem(keyOf(owner), JSON.stringify(next)) } catch { /* private mode: in-memory only */ }
    setHidden(next)
  }, [owner])
  return { hidden: new Set(hidden), hide: (k: string) => set(k, true), unhide: (k: string) => set(k, false) }
}
