'use client'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { termsOf, msUntilLapse, type CommerceFacts, type Terms } from '@marque/commerce/terms'

/**
 * Live terms in the browser (invariant 41). A page renders with the terms its server
 * render held; on mount, every price on the page is re-read in ONE request to
 * /api/v1/terms (coalesced across components), so a cached render never shows an old
 * price as current. A fresh price turns dated at its exact expiry, with no request.
 * Refresh asks the agent for a new price (rate limited server side).
 */

interface Entry { terms: Terms; serviceId: number | null; at: number }
const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => { version++; listeners.forEach((l) => l()) }

const queue = new Set<string>()
/** Ids whose first read is in flight: their render-time terms hold until it lands (or 2.5 s). */
const pending = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
const REREAD_MS = 60_000

function flush() {
  timer = null
  const ids = [...queue]
  queue.clear()
  for (let i = 0; i < ids.length; i += 24) {
    const chunk = ids.slice(i, i + 24)
    const release = () => { chunk.forEach((id) => pending.delete(id)); emit() }
    const guard = setTimeout(release, 2500)
    fetch(`/api/v1/terms?agents=${chunk.map(encodeURIComponent).join(',')}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { agents?: Array<{ agentId: string; serviceId: number | null; terms: Terms | null }> } | null) => {
        if (!j?.agents) return
        for (const a of j.agents) if (a.terms) entries.set(a.agentId, { terms: a.terms, serviceId: a.serviceId, at: Date.now() })
      })
      .catch(() => { /* keep what the render held; the price is still shown with its age */ })
      .finally(() => { clearTimeout(guard); release() })
  }
}

function want(id: string) {
  const e = entries.get(id)
  if (e && Date.now() - e.at < REREAD_MS) return
  queue.add(id)
  if (!e) pending.add(id)
  if (!timer) timer = setTimeout(flush, 40)
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snapshot = () => version
const serverSnapshot = () => 0

/** Re-evaluate terms against the clock: a fresh entry past its expiry reads as dated. */
function aged(t: Terms, now: number): Terms {
  if (t.state === 'fresh' && t.expiresAt && Date.parse(t.expiresAt) <= now) {
    return { ...t, state: 'dated', reason: 'Its last quote has lapsed.' }
  }
  return t
}

export function useAgentTerms(agentId: string, facts: CommerceFacts | null | undefined): {
  terms: Terms
  serviceId: number | null
  refresh: () => Promise<void>
  refreshing: boolean
  /** Null until mounted: before that, nothing clock-dependent renders (server and hydration agree). */
  now: number | null
} {
  useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => { setNow(Date.now()) }, [])
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => { want(agentId) }, [agentId])
  // Re-read when the tab returns after a while: a phone left open on a card overnight.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); want(agentId) } }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [agentId])
  const live = now === null ? undefined : entries.get(agentId)
  // Before mount, evaluate at time zero: an unexpired-looking quote renders as its stored
  // state on both server and client; the real clock takes over in the first effect.
  const base = live?.terms ?? termsOf(facts ?? null, now ?? 0)
  const terms = now === null || (!live && pending.has(agentId)) ? base : aged(base, now)
  const lapse = now === null ? null : msUntilLapse(terms, now)
  useEffect(() => {
    if (lapse === null) return
    const t = setTimeout(() => setNow(Date.now()), Math.min(lapse + 50, 2_147_483_000))
    return () => clearTimeout(t)
  }, [lapse])
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const r = await fetch('/api/v1/terms/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId }) })
      const j = (await r.json().catch(() => null)) as { terms?: Terms; serviceId?: number | null } | null
      if (r.ok && j?.terms) { entries.set(agentId, { terms: j.terms, serviceId: j.serviceId ?? null, at: Date.now() }); emit() }
    } finally {
      setRefreshing(false)
      setNow(Date.now())
    }
  }, [agentId])
  return { terms, serviceId: live?.serviceId ?? null, refresh, refreshing, now }
}
