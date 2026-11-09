import { chartersPublic } from '../../../lib/charters-access'
import { guardStats } from '../../../lib/guards'
import { NightReplay } from '../../charters/_components/NightReplay'
import styles from './band.module.css'

/** The Home band (11_PUBLIC_COPY): after the hire story, only once Charters is public; the live line only with data. */
const PROMISES: Array<[string, string]> = [
  ['Your limits are code, not settings.', 'Lifetime totals that never refill.'],
  ['The chain decides when.', 'Checked in the same transaction.'],
  ['You can end it in one step.', 'No server, relay or agent can stop you.'],
  ['Every action is on the record.', 'With its transaction and receipt.'],
]
const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86_400)} days ago`
}

export async function HomeChartersBand() {
  if (!chartersPublic()) return null
  const stats = await guardStats().catch(() => null)
  const main = stats?.chains.find((c) => c.chainId === 56)
  return (
    <section className={styles.band} aria-labelledby="charters-band">
      <div className={styles.text}>
        <span className={styles.eyebrow}>New on Marque: Charters</span>
        <h2 id="charters-band" className={styles.title}>Agents that act for you, <em>inside lines you draw.</em></h2>
        <p className={styles.body}>Pick what you want handled. Draw the limits. An agent acts only when the chain shows your condition, only inside your limits, and you can end it any time. Loan Guard, Yield Sweep, Grid Band and Range Keeper.</p>
        <ul className={styles.promises}>{PROMISES.map(([a, b]) => <li key={a}><b>{a}</b> {b}</li>)}</ul>
        <div className={styles.ctas}>
          <a className="btn btn--primary" href="/charters">See the four kinds</a>
          <a className="btn" href="/docs/charters">How charters work</a>
        </div>
        {main?.deployed && main.armed > 0 ? <p className={styles.live}>{main.armed} charter{main.armed === 1 ? '' : 's'} armed on BNB Smart Chain.{main.lastAction ? ` Last action ${ago(main.lastAction)}.` : ''}</p> : null}
      </div>
      <NightReplay />
    </section>
  )
}
