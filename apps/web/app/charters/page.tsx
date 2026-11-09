import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { CHARTER_CHAINS } from '@marque/charters'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { chartersVisible, PREVIEW_COOKIE } from '../../lib/charters-access'
import { guardStats, listGuards } from '../../lib/guards'
import { chartersV2Stats, listChartersV2 } from '../../lib/charters-v2'
import { tokens } from '../../lib/charters-builder'
import { NightReplay } from './_components/NightReplay'
import styles from './_components/hub.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Charters',
  description: 'Four kinds of charter on BNB Chain: guard a Venus loan, sweep idle stablecoins into Venus, trade a price band, keep a PancakeSwap range. Each does one job, only when the chain shows the condition, inside limits you sign.',
  robots: { index: false },
}

const CHAIN_NAME = { 56: 'BNB Smart Chain', 97: 'BSC testnet' } as const
const PROMISES: Array<[string, string]> = [
  ['Your limits are code, not settings.', 'Lifetime totals that never refill.'],
  ['The chain decides when.', 'Venus and PancakeSwap’s own numbers, checked in the same transaction.'],
  ['You can end it in one step.', 'No server, relay or agent can stop you.'],
  ['Every action is on the record.', 'Each one with its transaction and receipt.'],
]
const KINDS = [
  { kind: 'loan', name: 'Loan Guard', agent: 'Keel', cta: 'Guard a loan', promise: 'Keeps your Venus loan healthy. Repays from your wallet, only into your loan.' },
  { kind: 'yield', name: 'Yield Sweep', agent: 'Sluicegate', cta: 'Sweep idle money', promise: 'Keeps your wallet topped up and the rest earning in Venus, in your name.' },
  { kind: 'grid', name: 'Grid Band', agent: 'Lattice', cta: 'Grid a pair', promise: 'Buys the dips and sells one step up, between prices you choose.' },
  { kind: 'range', name: 'Range Keeper', agent: 'Bound', cta: 'Keep a range', promise: 'Keeps your PancakeSwap position in range, within loss limits you set.' },
] as const
const ago = (iso: string | null) => {
  if (!iso) return null
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86_400)} d ago`
}

/** /charters (03_EXPERIENCE sections 2 and 3.1). Behind CHARTERS_PUBLIC until launch. */
export default async function ChartersHub() {
  if (!chartersVisible((await cookies()).get(PREVIEW_COOKIE)?.value)) notFound()
  const [stats, v2stats, live] = await Promise.all([
    guardStats().catch(() => null),
    chartersV2Stats().catch(() => null),
    // The newest armed charter, mainnet first, any kind: what "See a live charter" opens.
    (async () => {
      for (const chainId of [56, 97] as const) {
        const r2 = await listChartersV2({ chainId, state: 'armed', limit: 1 }).catch(() => null)
        if (r2?.charters[0]) return r2.charters[0]
        if (!CHARTER_CHAINS[chainId].factory) continue
        const r = await listGuards({ chainId, state: 'armed', limit: 1 }).catch(() => null)
        if (r?.guards[0]) return r.guards[0]
      }
      return null
    })(),
  ])
  // Counts per kind and chain; Loan Guard adds its v1 guards to v2 (both are Loan Guards to a reader).
  const count = (kind: string, chainId: 56 | 97) => {
    const v2 = v2stats?.chains.find((c) => c.chainId === chainId)?.kinds.find((k) => k.kind === kind)
    const v1 = kind === 'loan' ? stats?.chains.find((c) => c.chainId === chainId) : null
    return { armed: (v2?.armed ?? 0) + (v1?.armed ?? 0), actions: (v2?.actions ?? 0) + (v1?.acts ?? 0), live: Boolean(v2?.deployed || v1?.deployed) }
  }
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <span className={styles.eyebrow}>New on Marque: Charters</span>
            <h1 className={styles.title}>Agents that act for you, <em>inside lines you draw.</em></h1>
            <p className={styles.lede}>Pick what you want handled. Draw the limits. An agent acts only when the chain shows your condition, only inside your limits, and you can end it any time.</p>
            <div className={styles.ctas}>
              <a className={styles.primary} href="/charters/new?kind=loan">Grant a charter</a>
              {live ? <a className={styles.secondary} href={`/charters/${live.chainId}/${live.address}`}>See a live charter</a> : null}
            </div>
            <ul className={styles.promises}>
              {PROMISES.map(([a, b]) => <li key={a}><b>{a}</b><span>{b}</span></li>)}
            </ul>
          </div>
          <NightReplay />
        </section>

        <section className={styles.band} aria-labelledby="live-h">
          <h2 id="live-h" className={styles.h2}>Loan Guard on chain now</h2>
          <div className={styles.stats}>
            {(stats?.chains ?? []).map((c) => (
              <div key={c.chainId} className={styles.stat}>
                <span className={styles.statNet}>{CHAIN_NAME[c.chainId]}</span>
                {!c.deployed ? <p className={styles.statEmpty}>Not live on this network yet.</p> : c.created === 0 ? <p className={styles.statEmpty}>No charters yet on {CHAIN_NAME[c.chainId]}.</p> : (
                  <dl>
                    <div><dt>Armed</dt><dd className="mono">{c.armed}</dd></div>
                    <div><dt>Actions</dt><dd className="mono">{c.acts}</dd></div>
                    <div><dt>Repaid</dt><dd className="mono">{c.repaid.length ? c.repaid.map((r) => `${tokens(BigInt(r.amount), r.decimals)} ${r.symbol}`).join(', ') : '0'}</dd></div>
                  </dl>
                )}
                {c.deployed && c.created > 0 ? <span className={styles.prov}>{c.acts === 0 ? 'No actions yet. ' : `Last action ${ago(c.lastAction)}. `}From the chain&apos;s events (onchain), read {new Date(stats!.readAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC.</span> : null}
              </div>
            ))}
            {!stats ? <p className={styles.statEmpty}>The charter index could not be read just now.</p> : null}
          </div>
        </section>

        <section className={styles.band} aria-labelledby="kinds-h">
          <h2 id="kinds-h" className={styles.h2}>Four kinds of charter</h2>
          <ul className={styles.kinds}>
            {KINDS.map((k) => {
              const m = count(k.kind, 56)
              const t = count(k.kind, 97)
              return (
                <li key={k.kind} data-live="true">
                  <b>{k.name}</b><span>Live</span>
                  <p>{k.promise}</p>
                  <p className={styles.fine}>{m.live ? `Mainnet: ${m.armed} armed, ${m.actions} actions.` : 'Mainnet: not live yet.'} {t.live ? `Testnet: ${t.armed} armed, ${t.actions} actions.` : ''} Acts: {k.agent}, or any agent you name.</p>
                  <a className={styles.secondary} href={`/charters/new?kind=${k.kind}`}>{k.cta}</a>
                </li>
              )
            })}
          </ul>
          {v2stats ? <p className={styles.prov}>Counts from the chain&apos;s events (onchain), read {new Date(v2stats.readAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC.</p> : <p className={styles.statEmpty}>The charter index could not be read just now.</p>}
        </section>

        <section className={styles.band} aria-labelledby="build-h">
          <h2 id="build-h" className={styles.h2}>For builders</h2>
          <p className={styles.lede}>Every armed charter is public work. Read them, press the button when the chain says so, and your agent&apos;s record shows it. <a href="/builders#charters">The charter kit</a>.</p>
        </section>

        <p className={styles.footLine}>
          Charters are new and unaudited. A Loan Guard cannot guarantee against liquidation, a grid holds what it bought in a fall, and a kept range can be worth less than holding. Read the contracts and their tests before you rely on one: <a href="https://github.com/talk2francis/Marque/tree/main/contracts/src/charters" target="_blank" rel="noreferrer">source</a>, <a href="/docs/charters">docs</a>. The earlier policy records stay at <a href="/app/charters">/app/charters</a>.
        </p>
      </main>
      <SiteFooter slim />
    </>
  )
}
