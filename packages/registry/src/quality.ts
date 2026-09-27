/**
 * The quality-listing verdict (SPEC-TRACKING section 10). Pure: the facts are read
 * elsewhere (chain, probes, tests); this file only decides, with a reason and the
 * exact fix for every check. If BNB defines "quality agent" differently, only this
 * file changes.
 *
 * An owner's agent is a quality listing on Marque when all five hold:
 *   1 identity   ERC-8004 identity on 56 or 97 owned by the wallet (ownerOf, read live)
 *   2 proved     ownership proved on Marque by a signed message from that wallet
 *   3 callable   a declared service answered as callable within the last 24 h
 *   4 classified in a Set and Earn category (or security), where an owner's declared
 *                category counts only if the classifier agrees or has no signal
 *   5 tested     it answered a live Marque test call with a well-formed response
 *                (passing MCS is not required; a pass also earns a Warrant)
 */

export type CheckId = 'identity' | 'proved' | 'callable' | 'classified' | 'tested'
export type CheckState = 'pass' | 'fail' | 'pending'

export interface QualityCheck {
  id: CheckId
  label: string
  state: CheckState
  /** What was measured, in plain words. */
  reason: string
  /** The next step when it is not passing; null when it passes. */
  fix: string | null
  /** A note that stays true even when passing (a flag, a date). */
  note?: string | null
}

export interface QualityVerdict {
  qualityListing: boolean
  passed: number
  checks: QualityCheck[]
}

export const LISTABLE_CATEGORIES = ['yield', 'grid', 'rebalancing', 'health_factor', 'security'] as const
export const CALLABLE_WITHIN_MS = 24 * 3600_000

export interface QualityFacts {
  chainId: number
  tokenId: string
  /** The wallet asking. */
  wallet: string
  /** ownerOf(tokenId) read now; null when the token does not exist or the read failed. */
  owner: string | null
  ownerReadFailed?: boolean
  /** The newest stored proof signed by the current owner. */
  proof: { owner: string; at: string } | null
  /** The newest time a declared service answered callable, from any Marque probe. */
  callable: { at: string; endpoint: string | null; via: 'probe' | 'builder' } | null
  /** The newest probe attempt that did not answer callable, for the reason. */
  lastProbeFailure?: { at: string; reason: string } | null
  /** The classifier's reading of the agent's own metadata. */
  classified: { category: string | null; confidence: number | null; rationale: string | null }
  /** What the owner declared on Marque, if anything. */
  declared: string | null
  /** The newest live Marque test for this identity. */
  test: { at: string; testId: string; wellFormed: boolean; pass: boolean; error: string | null } | null
  now?: number
}

const CAT_LABEL: Record<string, string> = { yield: 'Yield', grid: 'Grid', rebalancing: 'Rebalancing', health_factor: 'Health factor', security: 'Security' }
const listable = (c: string | null): c is string => c !== null && (LISTABLE_CATEGORIES as readonly string[]).includes(c)
const net = (chainId: number) => (chainId === 56 ? 'BSC mainnet' : chainId === 97 ? 'BSC testnet' : `chain ${chainId}`)
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/** The category that counts: the owner's when the classifier agrees or has no signal. */
export function effectiveCategory(f: Pick<QualityFacts, 'classified' | 'declared'>): { category: string | null; flag: string | null } {
  const c = listable(f.classified.category) ? f.classified.category : null
  const d = listable(f.declared) ? f.declared : null
  if (d && c && d !== c) return { category: null, flag: `You declared ${CAT_LABEL[d]}, but the agent's own description reads as ${CAT_LABEL[c]}.` }
  if (d && !c) return { category: d, flag: 'Declared by the owner; the description gave the classifier no signal either way.' }
  return { category: d ?? c, flag: null }
}

export function qualityVerdict(f: QualityFacts): QualityVerdict {
  const now = f.now ?? Date.now()
  const owned = same(f.owner, f.wallet)
  const checks: QualityCheck[] = []

  checks.push(
    owned
      ? { id: 'identity', label: 'You own its ERC-8004 identity', state: 'pass', reason: `ownerOf(${f.tokenId}) on ${net(f.chainId)} is this wallet, read just now.`, fix: null }
      : f.owner === null
        ? { id: 'identity', label: 'You own its ERC-8004 identity', state: 'fail', reason: f.ownerReadFailed ? `The identity registry on ${net(f.chainId)} did not answer.` : `No identity #${f.tokenId} exists on ${net(f.chainId)}.`, fix: f.ownerReadFailed ? 'Try again in a minute.' : 'Check the token id and network, or register an identity with BNB Agent Studio (bag).' }
        : { id: 'identity', label: 'You own its ERC-8004 identity', state: 'fail', reason: `Identity #${f.tokenId} is owned by ${f.owner}, not this wallet.`, fix: 'Connect the wallet that owns it.' },
  )

  const proved = owned && f.proof !== null && same(f.proof.owner, f.owner)
  checks.push(
    proved
      ? { id: 'proved', label: 'You proved it with a signature', state: 'pass', reason: `Signed by the owner on ${f.proof!.at.slice(0, 10)}. The signature is stored so anyone can re-check it.`, fix: null }
      : { id: 'proved', label: 'You proved it with a signature', state: owned ? 'fail' : 'pending', reason: f.proof && !same(f.proof.owner, f.owner) ? 'The stored proof was signed by a previous owner.' : 'No signature from the owner yet.', fix: owned ? 'Sign the proof message. It authorises nothing on chain and costs no gas.' : 'Needs the owning wallet first.' },
  )

  const fresh = f.callable !== null && now - Date.parse(f.callable.at) <= CALLABLE_WITHIN_MS
  checks.push(
    fresh
      ? { id: 'callable', label: 'Its endpoint answers a live call', state: 'pass', reason: `Answered as callable ${f.callable!.via === 'builder' ? 'to a probe run from this page' : "to Marque's scheduled probe"} at ${f.callable!.at.slice(0, 16).replace('T', ' ')} UTC.`, fix: null, note: f.callable!.endpoint }
      : {
          id: 'callable', label: 'Its endpoint answers a live call', state: 'fail',
          reason: f.lastProbeFailure ? `The last probe did not reach a callable service: ${f.lastProbeFailure.reason}.` : f.callable ? 'The last callable answer is more than 24 hours old.' : 'No probe has reached a callable service yet.',
          fix: 'Probe now. The endpoint must answer an A2A agent card or an MCP handshake with a task interface.',
        },
  )

  const eff = effectiveCategory(f)
  checks.push(
    eff.category
      ? { id: 'classified', label: 'It classifies into a quest category', state: 'pass', reason: `${CAT_LABEL[eff.category]}${f.declared ? ', declared by the owner' : `, from its description (confidence ${f.classified.confidence?.toFixed(2) ?? 'n/a'})`}.`, fix: null, note: eff.flag }
      : { id: 'classified', label: 'It classifies into a quest category', state: 'fail', reason: eff.flag ?? "The agent's description does not read as yield, grid, rebalancing, health factor or security.", fix: eff.flag ? 'Declare the category its description supports, or rewrite the description in its metadata.' : 'Declare its category here, or describe what it does in its ERC-8004 metadata.' },
  )

  const t = f.test
  checks.push(
    t && t.wellFormed
      ? { id: 'tested', label: 'It answered a live Marque test', state: 'pass', reason: `${t.testId} on ${t.at.slice(0, 10)}: ${t.pass ? 'passed, which also earns a Warrant' : 'a well-formed answer that did not pass every field (passing is not required)'}.`, fix: null }
      : { id: 'tested', label: 'It answered a live Marque test', state: eff.category && fresh ? 'fail' : 'pending', reason: t ? `${t.testId} on ${t.at.slice(0, 10)}: no gradable answer${t.error ? ` (${t.error.slice(0, 160)})` : ''}.` : 'Not tested yet.', fix: eff.category && fresh ? 'Run the live test for its category. Your endpoint gets a real task on real chain state.' : 'Needs a live endpoint and a category first.' },
  )

  const passed = checks.filter((c) => c.state === 'pass').length
  return { qualityListing: passed === checks.length, passed, checks }
}
