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
  | 'quest_check' | 'quest_next_click' | 'pass_created'
  | 'practice_funded' | 'practice_delivered' | 'practice_rated'
  | 'mainnet_funded' | 'mainnet_delivered' | 'mainnet_rated'

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

/**
 * A hire's funnel step, once per job per browser (kept in localStorage, so a reload or a second tab does not count it
 * again). Testnet jobs are practice; mainnet jobs are mainnet. The job id is never sent.
 */
export function trackJobStep(step: 'funded' | 'delivered' | 'rated', chainId: number, jobId: string) {
  if (typeof window === 'undefined') return
  // Pages in the same tab can follow the hire (the practice page times click to deposit with it).
  try { window.dispatchEvent(new CustomEvent('marque:funnel', { detail: { step, chainId, jobId } })) } catch { /* old browser */ }
  const key = `marque:funnel:${step}:${chainId}:${jobId}`
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1') } catch { /* storage refused: count it once for this page */ }
  track(`${chainId === 97 ? 'practice' : 'mainnet'}_${step}` as TrackName, undefined, { once: true })
}
