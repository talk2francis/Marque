'use client'
import { useEffect, useState } from 'react'
import styles from './register.module.css'

type Lane = 'all' | 'mainnet' | 'practice'
const OPTIONS: Array<{ lane: Lane; title: string; note: string }> = [
  { lane: 'all', title: 'All networks', note: 'pick the network when you hire' },
  { lane: 'mainnet', title: 'Mainnet', note: 'real money' },
  { lane: 'practice', title: 'Testnet', note: 'free practice' },
]

/**
 * The network filter (SPEC-ACCESS 1.2, invariant 32; 25 Oct: one list by default). 'All networks' lists each agent
 * once and the hire sheet picks mainnet (real money) or testnet (test tokens); the two single-network options list one
 * network only, each with its own count of agents hireable now. Amounts are never blended.
 */
export function LaneSwitch({ lane, onPick }: { lane: Lane; onPick: (l: Lane) => void }) {
  const [counts, setCounts] = useState<Record<Lane, number | null>>({ all: null, mainnet: null, practice: null })
  useEffect(() => {
    fetch('/api/v1/phase2/coverage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { mainnet?: { totalHireable?: number }; practice?: { totalHireable?: number } } | null) => {
        // 'All networks' shows no count: an agent on both networks is one listing, and summing the two would count it twice.
        if (j) setCounts({ all: null, mainnet: j.mainnet?.totalHireable ?? null, practice: j.practice?.totalHireable ?? null })
      })
      .catch(() => { /* the switch still works without counts */ })
  }, [])
  return (
    <div className={styles.laneSwitch} role="radiogroup" aria-label="Network">
      {OPTIONS.map((o) => (
        <button
          key={o.lane}
          type="button"
          role="radio"
          aria-checked={lane === o.lane}
          data-lane={o.lane}
          className={styles.laneOpt}
          onClick={() => onPick(o.lane)}
        >
          <span className={styles.laneTitle}>{o.title}</span>
          <span className={styles.laneNote}>{o.note}</span>
          {counts[o.lane] !== null ? <span className={styles.laneCount} aria-label={`${counts[o.lane]} hireable now`}>{counts[o.lane]}</span> : null}
        </button>
      ))}
    </div>
  )
}
