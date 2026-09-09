'use client'

import { ProvenanceChip } from '@marque/ui'
import styles from './me.module.css'

/**
 * "Put capital to work" — a pointer, not a pitch.
 *
 * Shown only when the read found somewhere obvious for capital to go: idle
 * stablecoins earning nothing, or no PancakeSwap liquidity at all. The one
 * number it shows — best net APR at the size actually held idle — is the
 * measured figure the positions reader already computed from on-chain rates,
 * carried through with its provenance. Nothing here is an APR Marque made up,
 * and the venues are external: Marque measures agents against them, it does not
 * run them.
 */

interface BestYield {
  protocol: string
  asset: string
  netAprPct: number
  breakEvenUsd: number
}

const fmtUsd = (n: number) =>
  n >= 1000 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`

export function EarnPointers({
  idleStableUsd,
  hasLpPosition,
  bestYield,
}: {
  idleStableUsd: number
  hasLpPosition: boolean
  bestYield: BestYield | null
}) {
  const idle = idleStableUsd > 1
  if (!idle && hasLpPosition) return null

  return (
    <section className={styles.block} aria-labelledby="earn-h">
      <h2 className={styles.blockHead} id="earn-h">Put capital to work</h2>

      {idle && (
        <p className={styles.earnLede}>
          About <strong>{fmtUsd(idleStableUsd)}</strong> here is sitting in stablecoins earning
          nothing.
          {bestYield && (
            <>
              {' '}The best net APR at that size Marque can measure right now is{' '}
              <strong>{bestYield.netAprPct.toFixed(2)}%</strong> on {bestYield.protocol}{' '}
              <ProvenanceChip provenance="MEASURED" />, break-even {fmtUsd(bestYield.breakEvenUsd)}.
            </>
          )}
        </p>
      )}
      {!idle && !hasLpPosition && (
        <p className={styles.earnLede}>
          No PancakeSwap V3 liquidity at this address. Providing liquidity in a range earns a
          share of swap fees while the price stays inside it.
        </p>
      )}

      <div className={styles.earnGrid}>
        <a className={styles.earnCard} href="/pancakeswap">
          <span className={styles.earnCardHead}>Marque · Pancake Desk</span>
          <span className={styles.earnCardBody}>
            See any V3 position, how far it is from its bounds, and hire an agent to re-centre it
            under a capped, revocable charter.
          </span>
          <span className={styles.earnCardGo} aria-hidden="true">→</span>
        </a>
        <a
          className={styles.earnCard}
          href="https://pancakeswap.finance/liquidity"
          rel="noreferrer noopener"
          target="_blank"
        >
          <span className={styles.earnCardHead}>PancakeSwap ↗</span>
          <span className={styles.earnCardBody}>
            Add or manage V3 liquidity directly. Their app, their transaction — Marque is not in
            the path.
          </span>
          <span className={styles.earnCardGo} aria-hidden="true">→</span>
        </a>
        <a
          className={styles.earnCard}
          href="https://app.venus.io/"
          rel="noreferrer noopener"
          target="_blank"
        >
          <span className={styles.earnCardHead}>Venus ↗</span>
          <span className={styles.earnCardBody}>
            Supply stablecoins to the Venus money market to earn the supply APR. Also external.
          </span>
          <span className={styles.earnCardGo} aria-hidden="true">→</span>
        </a>
        <a className={styles.earnCard} href="/register?category=yield">
          <span className={styles.earnCardHead}>Marque · yield agents</span>
          <span className={styles.earnCardBody}>
            Agents that route capital for net APR, ranked by whether they passed Marque&rsquo;s
            public test for the job.
          </span>
          <span className={styles.earnCardGo} aria-hidden="true">→</span>
        </a>
      </div>

      <p className={styles.earnFoot}>
        External venues are linked for convenience. Marque measures agents against them and never
        moves your funds — a charter is the only thing you ever sign, and it is spend-capped and
        revocable.
      </p>
    </section>
  )
}
