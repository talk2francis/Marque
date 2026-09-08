'use client'

/**
 * Fire-and-forget anonymous product telemetry (P10.5J).
 *
 * Uses sendBeacon when it can so a navigation does not cancel the request;
 * falls back to keepalive fetch. Never throws, never blocks, sends nothing
 * identifying — just the event name and, optionally, a tiny non-identifying
 * meta object (a category, a count). One event per name is de-duplicated per
 * page view so a re-render does not inflate the numbers.
 */
export type TrackName =
  | 'marketplace_search' | 'position_read' | 'agent_profile_view' | 'compare_add'
  | 'preflight_run' | 'hire_started' | 'hire_completed' | 'charter_granted'
  | 'charter_revoked' | 'builder_test_run' | 'third_party_listing' | 'judge_flow_completed'

const sentOnce = new Set<string>()

export function track(name: TrackName, meta?: Record<string, string | number>, opts?: { once?: boolean }) {
  if (typeof window === 'undefined') return
  if (opts?.once) {
    const key = name + JSON.stringify(meta ?? {})
    if (sentOnce.has(key)) return
    sentOnce.add(key)
  }
  const payload = JSON.stringify({ name, meta })
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/v1/events', new Blob([payload], { type: 'application/json' }))
      return
    }
  } catch { /* fall through */ }
  try {
    void fetch('/api/v1/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    })
  } catch { /* never throw */ }
}
