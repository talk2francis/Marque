'use client'
import { useEffect, useState } from 'react'

/** The organizer's two tracks for one address, from the public quest API (refreshed every 5 minutes). */
export interface OfficialQuest { hire: { distinctAgents: number; status: string }; build: { agents: Array<{ observed: number }> }; excluded: { team: boolean } }

export function useOfficialQuest(address: string | undefined | null): OfficialQuest | null {
  const [q, setQ] = useState<OfficialQuest | null>(null)
  useEffect(() => {
    if (!address) { setQ(null); return }
    let live = true
    const load = () => fetch(`/api/v1/quest/${address}`).then((r) => (r.ok ? r.json() : null)).then((j: OfficialQuest | null) => { if (live && j) setQ(j) }).catch(() => undefined)
    void load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5 * 60_000)
    return () => { live = false; clearInterval(t) }
  }, [address])
  return q
}
