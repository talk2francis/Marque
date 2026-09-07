import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Statement, Chip, ProvenanceChip, EmptyState } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { explorerTx, explorerAddress } from '../../../lib/network'
import styles from '../pancake.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'The PancakeSwap proof run',
  description:
    'One real mainnet PancakeSwap V3 rebalance under a capped, revocable charter — the position drifting out of range earning nothing, the three transactions, the after range, realised slippage, gas and the agent fee.',
}

interface Proof {
  status: 'pending' | 'complete'
  note?: string
  pool?: string
  chainId?: number
  agentId?: string
  charterScope?: { allowlist: string[]; capUsd: number; expiresAt: string }
  before?: { tickLower: number; tickUpper: number; currentTick: number; outOfRangeSince: string; hoursOutOfRange: number; feesAccruedUsd: number }
  transactions?: Array<{ label: string; hash: string }>
  after?: { tickLower: number; tickUpper: number; currentTick: number }
  realisedSlippageBps?: number
  gasUsd?: number
  agentFeeUsd?: number
  capturedAt?: string
}

async function loadProof(): Promise<Proof> {
  for (const base of [process.cwd(), join(process.cwd(), '..', '..')]) {
    try {
      const raw = await readFile(join(base, 'docs', 'pancakeswap-proof.json'), 'utf8')
      return JSON.parse(raw) as Proof
    } catch { /* try next */ }
  }
  return { status: 'pending' }
}

export default async function PancakeProof() {
  const p = await loadProof()
  const net = p.chainId ?? 56

  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1" size="page">The proof run</Statement>
          <p className={styles.lede}>
            One real mainnet PancakeSwap V3 rebalance, executed by an agent under a spend-capped,
            revocable charter. A deliberately tight range is opened so it drifts out within hours;
            we capture it earning nothing, the agent re-centring it, and every cost.
          </p>
        </header>

        {p.status !== 'complete' ? (
          <EmptyState title="The proof run has not happened yet.">
            <p>
              {p.note ??
                'It is a real mainnet transaction, which is escalation gate 1 — it runs only after written "approved, mainnet" and a funded, deliberately-tight range position. Nothing is simulated in its place.'}
            </p>
            <p>
              The guardrails it will follow — slippage caps, deadlines ≤ 5 minutes, approvals
              scoped to the exact amount, atomic multicall, a token safelist — are already stated
              on <a href="/pancakeswap">the Desk</a>.
            </p>
          </EmptyState>
        ) : (
          <>
            <section className={styles.section}>
              <h2 className={styles.h2}>The charter it ran under</h2>
              <p className={styles.note}>
                <Chip tone="chain">{net === 56 ? 'BSC mainnet · 56' : `chain ${net}`}</Chip>{' '}
                Cap ${p.charterScope?.capUsd} · expires {p.charterScope?.expiresAt} · allowlist:{' '}
                {p.charterScope?.allowlist.map((c) => (
                  <a key={c} href={explorerAddress(net, c)} target="_blank" rel="noreferrer" className="mono"> {c.slice(0, 10)}…</a>
                ))}
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.h2}>Before — out of range, earning nothing</h2>
              <table className={styles.table}>
                <tbody>
                  <tr><td>Range</td><td className="mono">[{p.before?.tickLower}, {p.before?.tickUpper}]</td></tr>
                  <tr><td>Current tick</td><td className="mono">{p.before?.currentTick}</td></tr>
                  <tr><td>Out of range since</td><td className="mono">{p.before?.outOfRangeSince}</td></tr>
                  <tr><td>Hours out of range</td><td className="mono">{p.before?.hoursOutOfRange} <ProvenanceChip provenance="MEASURED" /></td></tr>
                  <tr><td>Fees accrued while out</td><td className="mono">${p.before?.feesAccruedUsd?.toFixed(2)}</td></tr>
                </tbody>
              </table>
            </section>

            <section className={styles.section}>
              <h2 className={styles.h2}>The three transactions</h2>
              <ol className={styles.txList}>
                {p.transactions?.map((t) => (
                  <li key={t.hash}>
                    {t.label} —{' '}
                    <a href={explorerTx(net, t.hash)} target="_blank" rel="noreferrer" className="mono">{t.hash}</a>
                  </li>
                ))}
              </ol>
            </section>

            <section className={styles.section}>
              <h2 className={styles.h2}>After — re-centred</h2>
              <table className={styles.table}>
                <tbody>
                  <tr><td>Range</td><td className="mono">[{p.after?.tickLower}, {p.after?.tickUpper}]</td></tr>
                  <tr><td>Current tick</td><td className="mono">{p.after?.currentTick}</td></tr>
                  <tr><td>Realised slippage</td><td className="mono">{p.realisedSlippageBps} bps</td></tr>
                  <tr><td>Gas</td><td className="mono">${p.gasUsd?.toFixed(2)} <ProvenanceChip provenance="ONCHAIN" /></td></tr>
                  <tr><td>Agent fee</td><td className="mono">${p.agentFeeUsd?.toFixed(2)}</td></tr>
                </tbody>
              </table>
              <p className={styles.note}>Captured {p.capturedAt}.</p>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
