'use client'
import { useEffect, useState } from 'react'
import styles from './register.module.css'

type Lane = 'mainnet' | 'practice'
const OPTIONS: Array<{ lane: Lane; title: string; note: string }> = [
  { lane: 'mainnet', title: 'Mainnet', note: 'real money' },
  { lane: 'practice', title: 'Practice', note: 'BSC testnet, free' },
]

/**
 * The lane switch (SPEC-ACCESS 1.2, invariant 32). Two networks, two lanes, never blended:
 * mainnet is the default and the only real-money lane; practice is BSC testnet with test
 * tokens. Each option names its own count of agents hireable right now, read per lane.
 */
export function LaneSwitch({ lane, onPick }: { lane: Lane; onPick: (l: Lane) => void }) {
  const [counts, setCounts] = useState<Record<Lane, number | null>>({ mainnet: null, practice: null })
  useEffect(() => {
    fetch('/api/v1/phase2/coverage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { mainnet?: { totalHireable?: number }; practice?: { totalHireable?: number } } | null) => {
        if (j) setCounts({ mainnet: j.mainnet?.totalHireable ?? null, practice: j.practice?.totalHireable ?? null })
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
