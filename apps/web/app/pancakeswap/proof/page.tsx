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
    'One real mainnet PancakeSwap V3 rebalance under a capped, revocable charter — a deliberately narrow range drifting out and earning nothing, the transactions that re-centre it, and every cost.',
}

type Status = 'pending' | 'drifting' | 'complete' | 'failed'

interface Tx { label: string; hash: string }
interface Proof {
  status: Status
  note?: string
  pool?: string
  chainId?: number
  agentId?: string
  charterScope?: { allowlist: string[]; capUsd: number; expiresAt: string }
  before?: {
    tickLower: number; tickUpper: number; currentTick: number
    outOfRangeSince: string | null; hoursOutOfRange: number; feesAccruedUsd: number
  }
  narrative?: string
  transactions?: Tx[]
  after?: { tickLower: number; tickUpper: number; currentTick: number; inRange?: boolean; resumedAtBlock?: number | null }
  realisedSlippageBps?: number
  realisedSlippageNote?: string
  gasUsd?: number
  gasNote?: string
  agentFeeUsd?: number
  capturedAt?: string
  revertReason?: string
  failedAt?: string
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

const fmtTicksToPrice = (t: number) => (1 / Math.pow(1.0001, t)).toFixed(2) // USDT per BNB for the USDT/WBNB pool

function StatusLine({ p, net }: { p: Proof; net: number }) {
  const map: Record<Status, { tone: 'holds' | 'watch' | 'breach' | 'chain'; label: string }> = {
    pending: { tone: 'chain', label: 'Not started' },
    drifting: { tone: 'watch', label: 'Live on mainnet — position open, waiting to drift out' },
    complete: { tone: 'holds', label: 'Complete — re-centred on mainnet' },
    failed: { tone: 'breach', label: 'Attempted on mainnet — reverted, published as-is' },
  }
  const s = map[p.status]
  return (
    <p className={styles.note}>
      <Chip tone={s.tone}>{s.label}</Chip>
      <Chip tone="chain">{net === 56 ? 'BSC mainnet · 56' : `chain ${net}`}</Chip>
      {p.capturedAt ? <span> captured {new Date(p.capturedAt).toISOString().replace('T', ' ').slice(0, 16)}Z</span> : null}
    </p>
  )
}

function Charter({ scope, net }: { scope: NonNullable<Proof['charterScope']>; net: number }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>The charter it runs under</h2>
      <dl className={styles.facts}>
        <div><dt>Spend cap</dt><dd>${scope.capUsd.toFixed(2)} <ProvenanceChip provenance="MEASURED" /></dd></div>
        <div><dt>Expires</dt><dd>{new Date(scope.expiresAt).toISOString().replace('T', ' ').slice(0, 16)}Z</dd></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <dt>Contract allowlist — the only addresses it can touch</dt>
          <dd>
            {scope.allowlist.map((c) => (
              <a key={c} href={explorerAddress(net, c)} target="_blank" rel="noreferrer" className="mono">
                {c.slice(0, 10)}…{c.slice(-6)}{' '}
              </a>
            ))}
          </dd>
        </div>
      </dl>
      <p className={styles.note}>
        The same guardrails the <a href="/pancakeswap">Desk</a> states — slippage cap, deadline ≤ 5 minutes,
        approvals scoped to the exact amount, atomic multicall, a token safelist — apply to every transaction below.
      </p>
    </section>
  )
}

function Transactions({ txs, net }: { txs: Tx[]; net: number }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>The transactions</h2>
      <ol className={styles.agents}>
        {txs.map((t, i) => (
          <li key={t.hash} className={styles.agent}>
            <div className={styles.agentHead}>
              <span className={styles.tokenId}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.agentName}>{t.label}</span>
              <ProvenanceChip provenance="ONCHAIN" />
            </div>
            <a href={explorerTx(net, t.hash)} target="_blank" rel="noreferrer" className="mono">{t.hash}</a>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default async function PancakeProof() {
  const p = await loadProof()
  const net = p.chainId ?? 56

  return (
    <>
      <SiteHeader active="pancake" />
      <main className={styles.page}>
        <header className={styles.head}>
          <Statement as="h1" size="page">The proof run</Statement>
          <p className={styles.lede}>
            One real mainnet PancakeSwap V3 rebalance, executed under a spend-capped, revocable charter.
            A deliberately narrow range (~0.3%) is opened so it drifts out within hours; this page captures it
            earning nothing, the agent re-centring it, and every cost — and if the rebalance reverts, it
            captures that instead.
          </p>
          <StatusLine p={p} net={net} />
        </header>

        {p.status === 'pending' ? (
          <EmptyState title="The proof run has not started.">
            <p>
              {p.note ??
                'It is a real mainnet transaction — escalation gate 1 — so it runs only after written "approved, mainnet" and a funded, deliberately-tight range position. Nothing is simulated in its place.'}
            </p>
            <p>The guardrails it will follow are already stated on <a href="/pancakeswap">the Desk</a>.</p>
          </EmptyState>
        ) : null}

        {p.charterScope ? <Charter scope={p.charterScope} net={net} /> : null}

        {p.narrative ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>What happened</h2>
            <p className={styles.muted} style={{ maxWidth: '68ch' }}>{p.narrative}</p>
          </section>
        ) : null}

        {p.before ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>
              {p.status === 'complete' ? 'Before — out of range, earning nothing' : 'The open position'}
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Range</dt>
                <dd className="mono">
                  ${fmtTicksToPrice(p.before.tickUpper)} — ${fmtTicksToPrice(p.before.tickLower)} / BNB
                </dd>
              </div>
              <div><dt>Range ticks</dt><dd className="mono">[{p.before.tickLower}, {p.before.tickUpper}]</dd></div>
              <div><dt>Current tick</dt><dd className="mono">{p.before.currentTick} <ProvenanceChip provenance="ONCHAIN" /></dd></div>
              <div>
                <dt>Out of range since</dt>
                <dd className="mono">{p.before.outOfRangeSince ? `${p.before.outOfRangeSince.replace('T', ' ').slice(0, 16)}Z` : '— still in range'}</dd>
              </div>
              <div>
                <dt>Hours out of range</dt>
                <dd className="loss">{p.before.hoursOutOfRange > 0 ? `${p.before.hoursOutOfRange}h` : '0h'} <ProvenanceChip provenance="MEASURED" /></dd>
              </div>
              <div><dt>Fees earned while out</dt><dd className="mono">${p.before.feesAccruedUsd.toFixed(2)}</dd></div>
            </dl>
            {p.status === 'drifting' ? (
              <p className={styles.note}>{p.note}</p>
            ) : null}
          </section>
        ) : null}

        {p.transactions && p.transactions.length ? <Transactions txs={p.transactions} net={net} /> : null}

        {p.status === 'failed' ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>It reverted — and that is the record</h2>
            <p className={styles.note}>
              A receipted failure on mainnet is still evidence of a real system operating under real
              constraints. The revert reason, verbatim:
            </p>
            <pre className={styles.revert}>{p.revertReason || p.note}</pre>
            {p.failedAt ? <p className={styles.note}>Failed {p.failedAt.replace('T', ' ').slice(0, 16)}Z.</p> : null}
          </section>
        ) : null}

        {p.status === 'complete' && p.after ? (
          <>
            <section className={styles.section}>
              <h2 className={styles.h2}>After — re-centred, earning again</h2>
              <dl className={styles.facts}>
                <div>
                  <dt>New range</dt>
                  <dd className="mono">${fmtTicksToPrice(p.after.tickUpper)} — ${fmtTicksToPrice(p.after.tickLower)} / BNB</dd>
                </div>
                <div><dt>New range ticks</dt><dd className="mono">[{p.after.tickLower}, {p.after.tickUpper}]</dd></div>
                <div><dt>Current tick</dt><dd className="mono">{p.after.currentTick}</dd></div>
                <div><dt>In range</dt><dd>{p.after.inRange ? 'yes — fees resumed' : 'no'}</dd></div>
                {p.after.resumedAtBlock ? (
                  <div><dt>Fees resumed at block</dt><dd className="mono">{p.after.resumedAtBlock}</dd></div>
                ) : null}
              </dl>
            </section>

            <section className={styles.section}>
              <h2 className={styles.h2}>What it cost</h2>
              <dl className={styles.facts}>
                <div>
                  <dt>Realised slippage</dt>
                  <dd className="mono">{p.realisedSlippageBps ? `${p.realisedSlippageBps} bps` : '< 1 bps'} <ProvenanceChip provenance="ONCHAIN" /></dd>
                  {p.realisedSlippageNote ? <span className={styles.note}>{p.realisedSlippageNote}</span> : null}
                </div>
                <div>
                  <dt>Gas (all transactions)</dt>
                  <dd className="mono">${(p.gasUsd ?? 0).toFixed(2)} <ProvenanceChip provenance="ONCHAIN" /></dd>
                  {p.gasNote ? <span className={styles.note}>{p.gasNote}</span> : null}
                </div>
                <div><dt>Agent fee</dt><dd className="mono">${(p.agentFeeUsd ?? 0).toFixed(2)}</dd></div>
              </dl>
            </section>
          </>
        ) : null}
      </main>
      <SiteFooter />
    </>
  )
}
