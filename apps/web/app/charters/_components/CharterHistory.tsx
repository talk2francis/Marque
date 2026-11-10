'use client'
import { useState } from 'react'
import type { CharterKind } from '@marque/charters/client'
import { priceAt } from '../../../lib/charters-builder-v2'
import styles from './charter.module.css'
type Sample = { at: string; state: number; data: Record<string, unknown> }
/** Stored first-party samples only. Missing values remain gaps; no interpolation is a measurement. */
export function CharterHistory({ kind, samples, decimals, symbol, baseIs0 }: { kind: CharterKind; samples: Sample[]; decimals: number; symbol: string; baseIs0: boolean }) {
  const [selected, setSelected] = useState<number | null>(null)
  const field = kind === 'loan' ? 'health' : kind === 'yield' ? 'walletBalance' : 'twapTick'
  const valid = samples.flatMap(s => {
    const raw = s.data[field]
    if (raw === null || raw === undefined || !Number.isFinite(Number(raw)) || !Number.isFinite(Date.parse(s.at))) return []
    const value = kind === 'loan' ? Number(raw) / 1e18 : kind === 'yield' ? Number(raw) / 10 ** decimals : priceAt((baseIs0 ? 1 : -1) * Number(raw))
    return Number.isFinite(value) ? [{ ...s, value }] : []
  }).sort((a,b) => Date.parse(a.at)-Date.parse(b.at))
  const title = kind === 'loan' ? 'Loan health' : kind === 'yield' ? `Wallet ${symbol}` : 'Pool average price'
  if (valid.length < 2) return <section aria-label="Charter measured history"><h2 className={styles.h2}>Measured history</h2><p className={styles.fine}>{valid.length ? 'One stored sample so far. The chart appears after another sample is recorded.' : 'No stored history yet. Samples appear as the watcher reads this charter.'}</p></section>
  const picked = valid[Math.min(selected ?? valid.length - 1, valid.length - 1)]!
  const min = Math.min(...valid.map(s => s.value)), max = Math.max(...valid.map(s => s.value))
  const first = Date.parse(valid[0]!.at), span = Date.parse(valid.at(-1)!.at)-first
  const x = (s: typeof picked) => 20 + (Date.parse(s.at)-first) / Math.max(span,1)*560
  const y = (v: number) => 150 - (v-min)/Math.max(max-min,Math.abs(max)*0.001,0.001)*120
  const fmt = (v: number) => v.toLocaleString('en-US', { maximumSignificantDigits: 6 })
  return <section aria-label="Charter measured history"><h2 className={styles.h2}>Measured history</h2><p className={styles.fine}>Measured · Stored chain reads over the last 30 days, one sample from each 2.4 hour window. {title}. Lines connect samples; values between reads were not observed.</p>
    <svg viewBox="0 0 600 180" width="100%" role="img" aria-label={`${title}, from ${fmt(valid[0]!.value)} to ${fmt(valid.at(-1)!.value)}`}>
      <line x1="20" x2="580" y1="150" y2="150" stroke="var(--hair-2)" />
      <polyline points={valid.map(s => `${x(s)},${y(s.value)}`).join(' ')} fill="none" stroke="var(--brass)" strokeWidth="2" />
      <circle cx={x(picked)} cy={y(picked.value)} r="4" fill="var(--brass)" />
      <text x="20" y="15" fill="var(--ink-2)" fontSize="12">{fmt(max)}</text><text x="20" y="175" fill="var(--ink-2)" fontSize="12">{fmt(min)}</text>
    </svg>
    <label className={styles.fine}>Inspect a sample <input aria-label="History sample" type="range" min="0" max={valid.length-1} value={selected ?? valid.length-1} onChange={e => setSelected(Number(e.target.value))} style={{ width:'100%' }} /></label>
    <p className={styles.fine} aria-live="polite">{title}: {fmt(picked.value)} · {picked.at.replace('T',' ').slice(0,19)} UTC</p>
  </section>
}
