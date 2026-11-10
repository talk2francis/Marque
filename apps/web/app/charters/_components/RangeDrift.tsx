'use client'
import { useState } from 'react'
import { btFor, fmtPrice } from '../../../lib/charters-builder-v2'
import { rangeDrift, scenarioPrice } from '../../../lib/charter-scenarios'
import { BandRule } from './BandRule'
import styles from './builder.module.css'
export function RangeDrift({ tick, lower, upper, buffer, spacing, baseIs0, exit }: { tick: number; lower: number; upper: number; buffer: number; spacing: number; baseIs0: boolean; exit: boolean }) {
  const [change, setChange] = useState(0)
  const price = scenarioPrice(tick, baseIs0) * (1 + change / 100)
  const proposed = btFor(baseIs0 ? price : 1 / price)
  const result = rangeDrift(proposed, lower, upper, buffer, spacing)
  const bounds = [scenarioPrice(lower, baseIs0), scenarioPrice(upper, baseIs0)].sort((a,b) => a-b)
  const next = [scenarioPrice(result.next.lower, baseIs0), scenarioPrice(result.next.upper, baseIs0)].sort((a,b) => a-b)
  return <section className={styles.panel} aria-label="Range price drift simulation"><h3 className={styles.panelTitle}>Move the price <span className={styles.prov}>Simulation</span></h3>
    <label className={styles.field}><span>Hypothetical average: {change > 0 ? '+' : ''}{change}% · {fmtPrice(price)}</span><input aria-label="Range simulated price change" type="range" min="-30" max="30" step="1" value={change} onChange={e => setChange(Number(e.target.value))} /></label>
    <BandRule variant="read" min={Math.min(bounds[0]!, next[0]!, price)*0.97} max={Math.max(bounds[1]!, next[1]!, price)*1.03} low={bounds[0]!} high={bounds[1]!} step={1} bigStep={10} minGap={0} format={fmtPrice} words={(_,v) => fmtPrice(v)} lowName="from" highName="to" now={price} nowLabel="Scenario average" ghost={result.out && !exit ? { from: next[0]!, to: next[1]!, label: 'Proposed range in this simulation' } : null} label="Simulated range at a hypothetical price" tones={['brass','brass']} />
    <p className={styles.caption} aria-live="polite">{result.out ? exit ? 'Beyond the buffer: the charter would request an exit.' : `Beyond the buffer: a move would request ${fmtPrice(next[0]!)} to ${fmtPrice(next[1]!)}, the same width.` : 'Inside the range or its waiting buffer: no move requested.'}</p>
    <p className={styles.caption}>Assumes spot equals the average. The real contract also checks its interval, move count, liquidity and loss limits. Fees, gas and returns are not projected; keeping a range can underperform holding.</p>
  </section>
}
