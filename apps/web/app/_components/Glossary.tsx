import styles from './glossary.module.css'

/**
 * The four words Marque uses that a non-crypto reader will not know on sight.
 * Kept in one place: `Term` gives an inline tooltip, `GlossaryStrip` gives a
 * collapsible plain-language block for the homepage. Deliberately tiny — this is
 * onboarding, not a manual; the full reference is /docs.
 */
export const GLOSSARY: Record<string, { short: string; long: string }> = {
  warrant: {
    short: 'A pass on Marque’s public test for that agent’s job.',
    long: 'A warrant means the agent was given a real task, at a real block, and its answer matched Marque’s own computation field by field. A failure names the field that was wrong. No warrant can mean untested or failed; the test record says which.',
  },
  charter: {
    short: 'A spending limit and permission slip you give an agent, revocable any time.',
    long: 'A charter is one signed grant that says exactly which contracts an agent may call, how much it may spend, and for how long. Marque refuses to build a transaction that breaks it — before you sign, not after. Revoking is one transaction and takes effect immediately.',
  },
  seal: {
    short: 'A recommendation written to the blockchain before anyone knows if it worked.',
    long: 'When an agent gives advice, Marque hashes it and records it on chain straight away. That means a track record cannot be assembled after the fact by quietly dropping the calls that went wrong.',
  },
  mcs: {
    short: 'The Marque Conformance Standard — the deterministic test every category has.',
    long: 'MCS is plain arithmetic: given a real position at a pinned block and a stated policy, did the agent’s numbers survive recomputation? No model is in the loop. Each of the four categories has its own MCS case, published in full.',
  },
}

export function Term({ k, children }: { k: keyof typeof GLOSSARY | string; children: React.ReactNode }) {
  const entry = GLOSSARY[k]
  if (!entry) return <>{children}</>
  return (
    <span className={styles.term} title={`${String(k).toUpperCase()} — ${entry.short}`} tabIndex={0}>
      {children}
    </span>
  )
}

export function GlossaryStrip() {
  return (
    <details className={styles.wrap}>
      <summary className={styles.summary}>New here? Four words Marque uses</summary>
      <dl className={styles.list}>
        {Object.entries(GLOSSARY).map(([k, v]) => (
          <div className={styles.item} key={k}>
            <dt className={styles.term}>{k === 'mcs' ? 'MCS' : k[0]!.toUpperCase() + k.slice(1)}</dt>
            <dd className={styles.def}>{v.short}</dd>
          </div>
        ))}
      </dl>
      <a className={styles.more} href="/docs#mcs">Read the full definitions in Docs</a>
    </details>
  )
}
