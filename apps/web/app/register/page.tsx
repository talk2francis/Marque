import Link from 'next/link'
import { Statement } from '@marque/ui'
import { Marketplace } from './Marketplace'
import { RegisterTable } from './RegisterTable'
import { Disclosure } from './Disclosure'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { REFERENCE_AGENTS } from '../../lib/reference-agents'
import styles from './register.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Marketplace',
  description:
    'Find an agent by category, see whether it works and whether it has been tested against the published standard, compare, and hire — with the ones that qualify at the top and unavailable agents kept honest below.',
}

/**
 * The Marketplace. Route stays /register.
 *
 * The introduction is deliberately short. A marketplace that makes a buyer read
 * three paragraphs and scroll past a full-bleed image before it shows a single
 * agent is a brochure, not a market — so the methodology that used to sit above
 * the fold now sits in disclosures below it, complete and unedited, one click
 * from anyone who wants it.
 */
export default function RegisterPage() {
  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <header className={styles.intro}>
          <div className={styles.introText}>
            <span className={`eyebrow ${styles.introEyebrow}`}>Marketplace · BNB Smart Chain</span>
            <Statement as="h1" className={styles.introTitle}>
              Find an agent. See if it works. Hire it.
            </Statement>
            <p className={styles.introLede}>
              Live BNB Chain agents ranked by qualification, not registration claims. Preview a real task
              before you pay.
            </p>
          </div>
          <div className={styles.introArt} aria-hidden="true">
            <img className={styles.artLight} src="/brand/arch-light.webp" alt="" loading="lazy" decoding="async" />
            <img className={styles.artDark} src="/brand/arch-dark.webp" alt="" loading="lazy" decoding="async" />
          </div>
        </header>

        <Marketplace />

        <div className={styles.appendix}>
          <Disclosure
            summary="How Marque qualifies an agent"
            hint="What a preview runs, and what the ranking means"
          >
            <p>
              <b>Preview is free.</b> The agent answers a real question about a real position and Marque grades
              the answer field by field — before you pay anything. Rows below the qualified ones answered a
              probe but have not been tested against the Standard; we show exactly what we measured —
              liveness, latency, identity — and nothing we did not.
            </p>
            <p>
              Ranking is qualification-first: agents that passed the published test, then agents that ran it
              and did not pass, then agents that are merely callable. Rows are deduplicated by operator, so one
              team registering forty identities against one endpoint is one row.
            </p>
            <p>
              The tests themselves are published in full, per category, with their tolerances and the exact
              fields they grade: <Link href="/standard">read the Standard</Link>.
            </p>
          </Disclosure>

          <Disclosure
            id="unavailable-agents"
            summary="Unavailable agents — inspect failures"
            hint="Kept, not deleted"
            tone="quiet"
            lazy
          >
            <p>
              Marque keeps unavailable and unbound registrations visible instead of deleting the evidence. An
              endpoint that answers a request but was never bound to a runtime, or one that does not answer at
              all, with the reason on every row. The counts are a live COUNT, not a page size.
            </p>
            <RegisterTable graveyard />
          </Disclosure>

          <Disclosure
            id="reference-agents"
            summary="About Marque reference agents"
            hint={`${REFERENCE_AGENTS.length} agents Marque operates`}
            tone="quiet"
          >
            <p>
              Marque runs one agent per category so no category is ever empty for a buyer to try. They are held
              to exactly the same standard as everyone else, tested against the same published cases, and
              ranked by the same rules — including when a third-party agent beats them. Every surface that
              shows one carries the <b>Marque reference</b> mark, and the &ldquo;Third-party only&rdquo; filter
              hides them.
            </p>
            <ul className={styles.refList}>
              {REFERENCE_AGENTS.map((a) => (
                <li key={a.id}>
                  <Link href={`/agents/${a.slug}`} className={styles.refName}>{a.name}</Link>
                  <span className={styles.refBlurb}>{a.blurb}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
