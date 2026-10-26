'use client'
import { useEffect, useState } from 'react'
import { AgentCard } from '../market/AgentCard'
import { pickShowcase } from '../../../lib/ready-picks'
import type { MarketRow } from '../../register/market-model'
import styles from '../../home.module.css'

/**
 * "Ready to hire now" (defect D1). The home page is cached for 30 s and can be served long
 * after its quotes lapsed, so on mount the browser re-reads the agents hireable right now
 * and re-picks with the same rule as the server. Each card then keeps its own price
 * current through the shared terms reader.
 */
export function ReadyNow({ initial }: { initial: MarketRow[] }) {
  const [rows, setRows] = useState(initial)
  const [checked, setChecked] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/marketplace?tab=ready&sort=best&lane=mainnet&limit=60&failed=group', { cache: 'no-store', signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { agents?: MarketRow[] } | null) => { if (j?.agents) setRows(pickShowcase(j.agents)) })
      .catch(() => { /* keep the rendered cards; each still re-reads its own price */ })
      .finally(() => setChecked(true))
    return () => controller.abort()
  }, [])
  if (!rows.length) {
    return (
      <p className={styles.empty} aria-live="polite">
        {checked ? 'No agent has a current price this minute. ' : ''}Every agent and its last price is in the <a href="/register">marketplace</a>.
      </p>
    )
  }
  return (
    <div className={styles.cards}>
      {rows.map((a) => <AgentCard key={a.agentId} a={a} base="/" variant="feature" />)}
    </div>
  )
}
