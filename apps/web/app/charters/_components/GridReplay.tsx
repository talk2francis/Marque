'use client'
import { useState } from 'react'
import { fmtPrice, type GridPlan } from '../../../lib/charters-builder-v2'
import { gridPath } from '../../../lib/charter-scenarios'
import styles from './builder.module.css'
export function GridReplay({ plan, start }: { plan: GridPlan; start: number }) {
  const [mode, setMode] = useState<'dip' | 'fall' | 'rise'>('dip')
  const [progress, setProgress] = useState(0)
  const result = gridPath(plan, start, progress / 100, mode)
  const low = Math.min(start, plan.prices[0]!), high = Math.max(start, plan.prices[plan.slots]!)
  const y = (p: number) => 100 - (p - low) / Math.max(high - low, Number.EPSILON) * 80
  return <section className={styles.panel} aria-label="Grid price path simulation">
    <h3 className={styles.panelTitle}>Try a price path <span className={styles.prov}>Simulation</span></h3>
    <p className={styles.caption}>Explore which levels a chosen average-price path reaches. This rehearses thresholds, not executed trades or returns.</p>
    <div className={styles.chips} role="group" aria-label="Simulated price path">{(['dip', 'fall', 'rise'] as const).map(m => <button type="button" key={m} aria-pressed={mode === m} onClick={() => { setMode(m); setProgress(0) }}>{m === 'dip' ? 'Fall then recover' : m === 'fall' ? 'Keep falling' : 'Keep rising'}</button>)}</div>
    <svg viewBox="0 0 400 120" width="100%" role="img" aria-label={`Simulated average ${fmtPrice(result.price)}`}>
      {plan.prices.map((p, i) => <line key={i} x1="10" x2="390" y1={y(p)} y2={y(p)} stroke="var(--hair-2)" />)}
      <polyline points={Array.from({ length: progress + 1 }, (_, i) => `${10 + i * 3.8},${y(gridPath(plan, start, i / 100, mode).price)}`).join(' ')} fill="none" stroke="var(--brass)" strokeWidth="2" />
      <circle cx={10 + progress * 3.8} cy={y(result.price)} r="4" fill="var(--brass)" />
    </svg>
    <label className={styles.field}><span>Replay progress: {progress}% · Average {fmtPrice(result.price)}</span><input aria-label="Grid replay progress" type="range" min="0" max="100" value={progress} onChange={e => setProgress(Number(e.target.value))} /></label>
    <p className={styles.caption} aria-live="polite">{result.reached.filter(x => x.buyReached).length} buy thresholds visited; {result.reached.filter(x => x.sellReached).length} recovery thresholds visited.</p>
    <p className={styles.caption}>A visit is not a fill. Actual trading still needs funds, allowance, settled spot and average prices, remaining lifetime caps and an authorised caller. Fees, gas and liquidity are not simulated. Falling prices leave inventory exposed.</p>
  </section>
}
