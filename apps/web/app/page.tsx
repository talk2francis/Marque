import { BRAND } from '@marque/ui/brand'
import styles from './holding.module.css'

/**
 * P0 holding page. One line of type on --paper, and nothing else.
 *
 * The Desk replaces this in P4. Deliberately not styled beyond the type scale:
 * there is no point making a hero beautiful before it has real data in it.
 */
export default function HoldingPage() {
  return (
    <main className={styles.main}>
      <h1 className={`statement ${styles.line}`}>{BRAND.tagline}</h1>
    </main>
  )
}
