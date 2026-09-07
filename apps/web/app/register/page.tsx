import { Statement, Chip } from '@marque/ui'
import { RegisterTable } from './RegisterTable'
import { CategoryTabs } from './CategoryTabs'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { REFERENCE_AGENTS } from '../../lib/reference-agents'
import styles from './register.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'The Register',
  description:
    'Every agent Marque can find on BNB Smart Chain, with the ones that actually answer up top and the graveyard one click away — each dead row with the reason it is dead, measured by our own probe.',
}

export default function RegisterPage() {
  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
      <div className={styles.head}>
        <Statement as="h1">Every agent we can find on BNB Smart Chain.</Statement>
        <p className={styles.lede}>
          Default view is what actually works: reachable, and exposing something a buyer could
          hire. The rest is one click away with the reason it is not callable, measured by our
          own probe rather than taken from the registry.
        </p>
      </div>
      <CategoryTabs active="all" />
      <RegisterTable />

      <section id="reference-agents" className={styles.refSection}>
        <h2 className={styles.refHeading}>
          <Chip tone="watch">Marque reference agent</Chip> Why some agents here are ours
        </h2>
        <p className={styles.refCopy}>
          Marque runs one agent per category so no category is ever empty for a buyer to
          try. They are held to exactly the same standard as everyone else, tested against
          the same published cases, and ranked by the same rules — including when a
          third-party agent beats them. Every surface that shows one carries this mark, and
          a &ldquo;Third-party only&rdquo; filter hides them.
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
