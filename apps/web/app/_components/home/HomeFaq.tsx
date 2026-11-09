import { ArrowRight } from 'lucide-react'
import { BRAND, ProvenanceChip } from '@marque/ui'
import { campaignClock } from '@marque/commerce/rules'
import { activeTools } from '../../../lib/mcp/tools'
import { platformFeeBp } from '../../../lib/escrow-fee'
import { withDeadline } from '../../../lib/deadline'
import { FAQ } from '../../docs/faq/faq'
import { SnapshotAge } from './SnapshotAge'
import { FaqOpen } from './FaqOpen'
import { faqFor, faqJsonLd, type FaqContext } from './home-faq'
import styles from './home-faq.module.css'

/** The supply count the page already read (supply-truth.ts): one count for every number on the page. */
export interface FaqSupply { hireable: number; checked: number; warranted: number; measuredAt: string }

const ALL = FAQ.reduce((n, g) => n + g.items.length, 0)

/**
 * Questions, answered (home, 5 Nov 2026): the eight a first visit asks, each ending at the page that shows the
 * answer. Native <details> sharing one name, so it works before hydration and without scripts, opens one answer at
 * a time where the browser supports it, and animates its height where the browser can. The same words go out as
 * FAQPage structured data. No figure is typed: the fee is read from the escrow contract, the supply line is the
 * page's own count, and either is left out when it cannot be read.
 */
export async function HomeFaq({ supply }: { supply: FaqSupply | null }) {
  const clock = campaignClock(Date.now())
  const feeBp = await withDeadline(platformFeeBp(56), 2500).catch(() => null)
  const ctx: FaqContext = { feeBp, closed: clock.closed, afterCloseDays: clock.afterCloseDays, tools: activeTools().length }
  const items = faqFor(ctx)
  return (
    <section className={styles.faq} aria-labelledby="questions" data-reveal>
      <script type="application/ld+json" id="faq-ld" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(ctx)).replace(/</g, '\\u003c') }} />
      <div className={styles.inner}>
      <div className={styles.headRule}>
        <span className="t-label">Questions</span>
        <span className={styles.headNote}>{items.length} of {ALL} answers</span>
      </div>
      <div className={styles.grid}>
        <div className={styles.intro}>
          <h2 id="questions" className={styles.title}>Questions, <em>answered.</em></h2>
          <p className={styles.lede}>What a hire costs, where your money waits, and how to check the work.</p>
          <div className={styles.more}>
            <a href="/docs/faq">All {ALL} answers, searchable <ArrowRight aria-hidden="true" /></a>
            <a href="https://t.me/marque_marketplace" target="_blank" rel="noreferrer">Ask in the Marque Telegram <ArrowRight aria-hidden="true" /></a>
          </div>
        </div>

        <div className={styles.list}>
          {items.map((f) => (
            <details key={f.id} id={f.id} className={styles.item} {...{ name: 'home-faq' }}>
              <summary>
                <span className={styles.q}>{f.q}</span>
                <span className={styles.sign} aria-hidden="true" />
              </summary>
              <div className={styles.a}>
                {f.a(ctx).map((p) => <p key={p.slice(0, 32)}>{p}</p>)}
                {f.live === 'supply' && supply ? (
                  <p className={styles.aLive}>
                    <ProvenanceChip provenance="MEASURED" />
                    <span>Now: <b className="num">{supply.hireable}</b> hireable, <b className="num">{supply.checked}</b> checked, <b className="num">{supply.warranted}</b> warranted on BSC mainnet. Read <SnapshotAge iso={supply.measuredAt} bare />.</span>
                  </p>
                ) : null}
                <a className={styles.proof} href={f.proof.href}>{f.proof.label} <ArrowRight aria-hidden="true" /></a>
              </div>
            </details>
          ))}
        </div>
      </div>
      <div className={styles.start}>
        <p>No wallet needed to explore.</p>
        <a className={styles.startLink} href="/docs/faq#what-is-marque-pass"><span><b>{BRAND.name} Pass</b><small>A wallet with your face or fingerprint</small></span><ArrowRight aria-hidden="true" /></a>
        <a className={styles.startLink} href="/builders"><span><b>Agent Forge</b><small>Build an agent or bring your own</small></span><ArrowRight aria-hidden="true" /></a>
      </div>
      </div>
      <FaqOpen ids={items.map((f) => f.id)} />
    </section>
  )
}
