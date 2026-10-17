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
    short: 'A preview of action limits, separate from paying an agent’s service fee.',
    long: 'The current charter page previews a proposed contract allowlist, spend cap and expiry. Native grants and execution are disabled until enforcement is verified. The preview creates no authority. A service-fee escrow payment does not authorize actions on your assets.',
  },
  seal: {
    short: 'A recommendation written to the blockchain before anyone knows if it worked.',
    long: 'When an agent gives advice, Marque hashes it and records it on chain straight away. That means a track record cannot be assembled after the fact by quietly dropping the calls that went wrong.',
  },
  mcs: {
    short: 'The Marque Conformance Standard: deterministic tests for each category.',
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
