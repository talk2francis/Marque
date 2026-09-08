import { Statement, Chip } from '@marque/ui'
import { Marketplace } from './Marketplace'
import { RegisterTable } from './RegisterTable'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { REFERENCE_AGENTS } from '../../lib/reference-agents'
import styles from './register.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Marketplace',
  description:
    'Find an agent by category, see whether it works and whether it has been tested against the published standard, compare, and hire — with the ones that qualify at the top and the graveyard kept honest below.',
}

/**
 * The Marketplace (P10.5B). Route stays /register; the page leads with a
 * qualification-sorted, deduplicated, hireable view. "The Marque Register" is
 * the secondary line — "Register" as a label reads as sign-up.
 */
export default function RegisterPage() {
  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
      <div className={styles.head}>
        <Statement as="h1">Find an agent, see if it works, hire it.</Statement>
        <p className={styles.lede}>
          The Marque Register — every agent we can find on BNB Smart Chain, ranked by whether it
          is callable and whether it has passed the published test. Deduplicated by operator, so
          one team registering forty identities is one row.
        </p>
      </div>
      <div className={styles.brandBand} aria-hidden="true">
        <img className={styles.bandLight} src="/brand/arch-light.webp" alt="" loading="lazy" decoding="async" />
        <img className={styles.bandDark} src="/brand/arch-dark.webp" alt="" loading="lazy" decoding="async" />
      </div>
      <Marketplace />

      <section className={styles.graveyard}>
        <h2 className={styles.h2}>The graveyard</h2>
        <p className={styles.refCopy}>
          Kept, not hidden. An endpoint that answers a request but was never bound to a runtime,
          or one that does not answer at all, with the reason on every row. This transparency is
          a differentiator; the counts are a live COUNT, not a page size.
        </p>
        <RegisterTable graveyard />
      </section>

      <section id="reference-agents" className={styles.refSection}>
        <h2 className={styles.refHeading}>
          <Chip tone="watch">Marque reference agent</Chip> Why some agents here are ours
        </h2>
        <p className={styles.refCopy}>
          Marque runs one agent per category so no category is ever empty for a buyer to try.
          They are held to exactly the same standard as everyone else, tested against the same
          published cases, and ranked by the same rules — including when a third-party agent
          beats them. Every surface that shows one carries this mark, and the
          &ldquo;Third-party only&rdquo; filter hides them.
        </p>
        <ul className={styles.refList}>
          {REFERENCE_AGENTS.map((a) => (
            <li key={a.id}>
              <span className={styles.refName}>{a.name}</span>
              <span className={styles.refBlurb}>{a.blurb}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
      <SiteFooter />
    </>
  )
}
