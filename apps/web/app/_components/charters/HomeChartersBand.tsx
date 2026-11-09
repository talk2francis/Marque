import { chartersPublic } from '../../../lib/charters-access'
import { guardStats } from '../../../lib/guards'
import { NightReplay } from '../../charters/_components/NightReplay'
import styles from './band.module.css'

/** The Home band (11_PUBLIC_COPY): after the hire story, only once Charters is public; the live line only with data. */
const PROMISES: Array<[string, string]> = [
  ['Your money stays with you.', 'Nothing moves until your loan needs it.'],
  ['One destination.', 'It can only repay your own loan.'],
  ['The chain decides when.', 'Venus’s own numbers, checked in the same transaction.'],
  ['One tap to end it.', 'No server, relay or agent can stop you.'],
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
        <h2 id="charters-band" className={styles.title}>Agents that act for you, <em>inside a line you draw.</em></h2>
        <p className={styles.body}>Start with your Venus loan. Set the health it should never drop below, and the most it may use. If the chain shows your loan crossing that line, an agent repays from your own wallet into your own loan, and stops at your limit.</p>
        <ul className={styles.promises}>{PROMISES.map(([a, b]) => <li key={a}><b>{a}</b> {b}</li>)}</ul>
        <div className={styles.ctas}>
          <a className="btn btn--primary" href="/charters/new">Guard a loan</a>
          <a className="btn" href="/docs/charters#when">How it decides</a>
        </div>
        {main?.deployed && main.armed > 0 ? <p className={styles.live}>{main.armed} charter{main.armed === 1 ? '' : 's'} armed on BNB Smart Chain.{main.lastAction ? ` Last action ${ago(main.lastAction)}.` : ''}</p> : null}
      </div>
      <NightReplay />
    </section>
  )
}
