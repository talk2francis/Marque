import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { CHARTER_CHAINS } from '@marque/charters'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { chartersVisible, PREVIEW_COOKIE } from '../../lib/charters-access'
import { guardStats, listGuards } from '../../lib/guards'
import { tokens } from '../../lib/charters-builder'
import { NightReplay } from './_components/NightReplay'
import styles from './_components/hub.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Charters',
  description: 'Draw a line under your Venus loan. If the chain shows it crossing, an agent repays from your own wallet, into your own loan, never past the budget you set.',
  robots: { index: false },
}

const CHAIN_NAME = { 56: 'BNB Smart Chain', 97: 'BSC testnet' } as const
const PROMISES: Array<[string, string]> = [
  ['Your money stays with you.', 'Nothing moves until your loan needs it.'],
  ['One destination.', 'It can only repay your own loan.'],
  ['The chain decides when.', 'Venus’s own numbers, checked in the same transaction.'],
  ['One tap to end it.', 'No server, relay or agent can stop you.'],
]
const ago = (iso: string | null) => {
  if (!iso) return null
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86_400)} d ago`
}

/** /charters (03_EXPERIENCE sections 2 and 3.1). Behind CHARTERS_PUBLIC until launch. */
export default async function ChartersHub() {
  if (!chartersVisible((await cookies()).get(PREVIEW_COOKIE)?.value)) notFound()
  const [stats, live] = await Promise.all([
    guardStats().catch(() => null),
    // The newest armed charter, mainnet first: what "See a live charter" opens.
    (async () => {
      for (const chainId of [56, 97] as const) {
        if (!CHARTER_CHAINS[chainId].factory) continue
        const r = await listGuards({ chainId, state: 'armed', limit: 1 }).catch(() => null)
        if (r?.guards[0]) return r.guards[0]
      }
      return null
    })(),
  ])
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <span className={styles.eyebrow}>New on Marque: Charters</span>
            <h1 className={styles.title}>Your loan, guarded <em>while you sleep.</em></h1>
            <p className={styles.lede}>Draw a line under your Venus loan. If the chain shows it crossing, an agent repays from your own wallet, into your own loan, never past the budget you set. End it whenever you like.</p>
            <div className={styles.ctas}>
              <a className={styles.primary} href="/charters/new">Guard a loan</a>
              {live ? <a className={styles.secondary} href={`/charters/${live.chainId}/${live.address}`}>See a live charter</a> : null}
            </div>
            <ul className={styles.promises}>
              {PROMISES.map(([a, b]) => <li key={a}><b>{a}</b><span>{b}</span></li>)}
            </ul>
          </div>
          <NightReplay />
        </section>

        <section className={styles.band} aria-labelledby="live-h">
          <h2 id="live-h" className={styles.h2}>On chain now</h2>
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
          <h2 id="kinds-h" className={styles.h2}>Kinds of charter</h2>
          <ul className={styles.kinds}>
            <li data-live="true"><b>Loan Guard</b><span>Live</span><p>Repays your Venus stablecoin loan back to a health you choose when it falls below another.</p></li>
            <li><b>Range Keeper</b><span>Next</span></li>
            <li><b>Yield Sweep</b><span>Next</span></li>
            <li><b>Grid Band</b><span>Next</span></li>
          </ul>
          <p className={styles.fine}><a href="https://t.me/marque_marketplace" target="_blank" rel="noreferrer">Tell us which comes next</a></p>
        </section>

        <section className={styles.band} aria-labelledby="build-h">
          <h2 id="build-h" className={styles.h2}>For builders</h2>
          <p className={styles.lede}>Every armed charter is public work. Read them, press the button when the chain says so, and your agent&apos;s record shows it. <a href="/builders#charters">The charter kit</a>.</p>
        </section>

        <p className={styles.footLine}>
          Charters are new and unaudited. Read the contracts and their tests before you rely on one: <a href="https://github.com/talk2francis/Marque/tree/main/contracts/src/charters" target="_blank" rel="noreferrer">source</a>, <a href="/docs/charters">docs</a>. The earlier policy records stay at <a href="/app/charters">/app/charters</a>.
        </p>
      </main>
      <SiteFooter slim />
    </>
  )
}
