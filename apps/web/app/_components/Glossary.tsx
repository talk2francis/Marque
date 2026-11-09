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
    long: 'A warrant means the agent was given a real task, at a real block, and its answer matched Marque’s own computation field by field, in the test’s exact format, in the last 14 days. It is the top badge, not a condition for being hired. A failure names the value that was wrong; an answer in another layout is shown as not in the test’s format, which counts as untested.',
  },
  // Once Charters is public (AGENTS.md section 14) the word means Loan Guard, not the earlier preview.
  charter: process.env['CHARTERS_PUBLIC'] === '1' ? {
    short: 'An onchain limit on what an agent may do for you.',
    long: 'A charter is a contract you sign once that fixes exactly what an agent may do for you and until when. Four kinds: Loan Guard keeps your Venus loan healthy; Yield Sweep keeps your wallet topped up and the rest earning in Venus; Grid Band buys the dips and sells one step up; Range Keeper keeps your PancakeSwap position in range. You can end any of them at any time in one transaction.',
  } : {
    short: 'A preview of action limits, separate from paying an agent’s service fee.',
    long: 'The current charter page previews a proposed contract allowlist, spend cap and expiry. Native grants and execution are disabled until enforcement is verified. The preview creates no authority. A service-fee escrow payment does not authorize actions on your assets.',
  },
  'loan guard': { short: 'Keeps your Venus loan healthy.', long: 'Repays from your wallet, only into your own loan, when Venus shows its health below your trigger, back to your target and never past your budget.' },
  'yield sweep': { short: 'Keeps your wallet topped up and the rest earning.', long: 'Keeps your wallet between a floor and a ceiling; the excess goes to Venus in your name and comes back when you run low.' },
  'grid band': { short: 'Buys the dips and sells one step up.', long: 'Buys a fixed order at each level as the price falls and sells it one level higher, between prices you choose, on one reviewed PancakeSwap pool.' },
  'range keeper': { short: 'Keeps your PancakeSwap position in range.', long: 'Moves your position back around the price when it leaves its range, same width, within loss, frequency and count limits you set. It holds your position NFT while it runs.' },
  trigger: { short: 'The health below which a Loan Guard acts.', long: 'When Venus shows your loan health below the trigger, the guard may repay. The target is the health it repays back to.' },
  floor: { short: 'The least a Yield Sweep keeps in your wallet.', long: 'Below the floor it brings back what it supplied; above the ceiling it supplies the rest to Venus in your name.' },
  level: { short: 'A price where a Grid Band buys, and sells one level up.', long: 'Levels are spaced so that a completed round trip at the worst allowed prices, fees included, never returns less than it spent.' },
  range: { short: 'The prices where a PancakeSwap position earns fees.', long: 'Outside its range a position earns nothing; a Range Keeper moves it back around the price.' },
  limit: { short: 'The most a charter can ever use, tips separate.', long: 'Every charter limit is a lifetime total that never refills: a budget, a supply cap, buy and sell totals, or a number of moves.' },
  'named agent': { short: 'An agent you allowed to act on a Grid Band or Range Keeper.', long: 'Because the moment of a trade has value, only the owner and the agents the owner names may act on these kinds.' },
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
    <span className={styles.term} title={`${String(k).toUpperCase()}: ${entry.short}`} tabIndex={0}>
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
