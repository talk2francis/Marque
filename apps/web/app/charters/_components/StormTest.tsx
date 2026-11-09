'use client'
import { useId, useMemo, useState } from 'react'
import { priceToUsd, storm, WAD, type FramingInput, type StormGuard } from '@marque/charters/client'
import { tokens, usd } from '../../../lib/charters-builder'
import styles from './builder.module.css'

/**
 * "What if BTCB falls?" (03_EXPERIENCE section 4): the main collateral's price walks down in 0.5% steps; without a
 * guard health just falls, with this charter each step that crosses the trigger runs the guard's own act()
 * arithmetic (the parity-tested health.ts). A projection, and labelled one.
 */
export function StormTest({ framing, guard, collateral, debt, walletShort }: {
  framing: FramingInput
  guard: StormGuard
  /** What the wallet holds now, when that is less than the budget the projection assumes. */
  walletShort: bigint | null
  collateral: { symbol: string; decimals: number }
  debt: { symbol: string; decimals: number }
}) {
  const [drop, setDrop] = useState(30)
  const id = useId()
  const r = useMemo(() => storm(framing, guard, drop), [framing, guard, drop])
  const priceNow = priceToUsd(framing.main.price, collateral.decimals)
  const priceThen = priceNow * (1 - drop / 100)
  const h = (v: bigint | null) => (v === null ? 'no debt left' : (Number((v * 10_000n) / WAD) / 10_000).toFixed(2))
  return (
    <section className={`${styles.panel} ${styles.storm}`} aria-labelledby={`${id}-h`}>
      <div className={styles.panelHead}>
        <h3 id={`${id}-h`}>What if {collateral.symbol} falls?</h3>
        <span className={styles.simLabel}>Projection</span>
      </div>
      <p className={styles.sub}>Move the price. The guard&apos;s math here is the same math the contract runs; every other price is held where it is.</p>
      <label className={styles.rangeRow}>
        <span className="sr-only">{collateral.symbol} price change</span>
        <input type="range" min={0} max={60} step={1} value={drop} onChange={(e) => setDrop(Number(e.target.value))}
          aria-valuetext={`${drop}% lower, about ${usd(priceThen)}`} />
        <span className={`mono ${styles.rangeValue}`}>-{drop}%</span>
      </label>
      <div className={styles.stormOut} aria-live="polite">
        <div>
          <span className={styles.stormHead}>Without a guard, at about {usd(priceThen)}</span>
          {r.without.liquidated
            ? <span className={styles.stormBad}>Liquidated</span>
            : <span className={styles.stormValue}>Health {h(r.without.health)}</span>}
          <span className={styles.stormSub}>{r.without.liquidated ? 'Venus could sell your collateral at a discount.' : 'Still above 1.00.'}</span>
        </div>
        <div>
          <span className={styles.stormHead}>With this charter</span>
          {r.with.liquidated
            ? <span className={styles.stormBad}>Liquidated</span>
            : <span className={styles.stormOk}>Health {h(r.with.health)}</span>}
          <span className={styles.stormSub}>
            {r.actions === 0
              ? r.ranOut ? 'The guard could not act: what it may use would not lift health back to 1.00.' : 'The guard would not need to act.'
              : `The guard acts ${r.actions === 1 ? 'once' : `${r.actions} times`} and uses ${tokens(r.used, debt.decimals)} ${debt.symbol}.`}
            {r.actions > 0 && r.ranOut ? ' Then the budget runs out: a larger budget, or a higher trigger, covers a deeper fall.' : ''}
          </span>
        </div>
      </div>
      {walletShort !== null ? <p className={styles.fine}>This assumes the whole budget is in the wallet when the guard acts. It holds {tokens(walletShort, debt.decimals)} {debt.symbol} now, and the guard can use only what is there.</p> : null}
    </section>
  )
}
