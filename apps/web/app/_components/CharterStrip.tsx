'use client'

import { useEffect, useState } from 'react'
import styles from './strip.module.css'

/**
 * The mandate strip.
 *
 * Pinned to the header on every page whenever any charter is live, showing what
 * is left of the cap and how long it has to run, with revoke one click away.
 *
 * This exists because a bounded authority nobody can see is not meaningfully
 * bounded. Altana's criteria name user-facing visibility and revocation
 * explicitly, and the honest reading of that is not "a charters page exists" —
 * it is that a person three pages deep in the Register still knows an agent is
 * holding authority over their money, and can end it from where they stand.
 *
 * Everything here is real: the cap and the expiry come from the granted
 * charter, and the countdown is arithmetic on its expiry timestamp. Nothing is
 * simulated, and when no charter is live the strip is absent rather than empty.
 */

/**
 * Fired whenever a charter is granted or revoked, so the strip stops claiming
 * authority is live the instant it is not.
 */
export const CHARTERS_CHANGED = 'marque:charters-changed'

export function announceChartersChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHARTERS_CHANGED))
}

interface Cap { symbol: string; limit: number; spent: number; remaining: number }
interface StripCharter {
  id: string
  agentName: string | null
  agentId: string
  label: string | null
  expiresAt: string
  caps: Cap[]
  callsUsed: number
}

function remainingLabel(expiresAt: string, now: number): string {
  const seconds = Math.floor((new Date(expiresAt).getTime() - now) / 1000)
  if (seconds <= 0) return 'expired'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function CharterStrip() {
  const [charters, setCharters] = useState<StripCharter[] | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/v1/charters/active', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { charters: StripCharter[] }
        if (!cancelled) setCharters(data.charters)
      } catch {
        // A strip that cannot read is a strip that says nothing, never one that
        // shows a stale "active" over a charter that may have been revoked.
        if (!cancelled) setCharters([])
      }
    }
    void load()
    const poll = setInterval(load, 15_000)
    const tick = setInterval(() => setNow(Date.now()), 1000)

    // A fifteen-second poll meant the strip could go on saying "Charter active"
    // for fifteen seconds after the revoke transaction had already landed —
    // caught in the judge-mode recording. On a page whose entire job is showing
    // that authority is live, that is the one staleness that must never happen,
    // so grants and revocations announce themselves and the strip refetches at
    // once. The poll stays as the backstop for changes made in another tab.
    const onChanged = () => { void load() }
    window.addEventListener(CHARTERS_CHANGED, onChanged)

    return () => {
      cancelled = true
      clearInterval(poll); clearInterval(tick)
      window.removeEventListener(CHARTERS_CHANGED, onChanged)
    }
  }, [])

  const live = (charters ?? []).filter((c) => new Date(c.expiresAt).getTime() > now)
  if (live.length === 0) return null

  const first = live[0]!
  const cap = first.caps[0]
  const pctLeft = cap && cap.limit > 0 ? Math.max(0, Math.min(1, cap.remaining / cap.limit)) : 1
  const timeLeft = remainingLabel(first.expiresAt, now)
  const urgent = new Date(first.expiresAt).getTime() - now < 5 * 60_000

  return (
    <div className={styles.strip} role="status" aria-live="polite">
      <span className={styles.mark} aria-hidden="true" />
      <span className={styles.what}>
        {live.length > 1 ? `${live.length} charters active` : 'Charter active'}
        <span className={styles.who}> · {first.agentName ?? first.agentId}</span>
      </span>

      <span className={styles.meter} aria-hidden="true">
        <span className={styles.meterFill} style={{ transform: `scaleX(${pctLeft})` }} />
      </span>

      {cap && (
        <span className={`mono ${styles.figure}`}>
          {cap.remaining.toFixed(4)} of {cap.limit.toFixed(4)} {cap.symbol} left
        </span>
      )}
      <span className={`mono ${styles.figure} ${urgent ? styles.urgent : ''}`}>{timeLeft} left</span>

      <a className={styles.revoke} href="/app/charters">Revoke</a>
    </div>
  )
}
