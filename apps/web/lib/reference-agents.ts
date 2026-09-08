/**
 * The single source of truth for Marque's own reference agents (P10.5A item 3).
 *
 * One display name per agent, resolved from here, identical on the Register, the
 * profile, the Ledger, the Charter Desk, the Judge flow and every receipt. Three
 * names for one agent is a bug, not a cosmetic issue (AGENTS.md invariant 18).
 *
 * These agents exist only to guarantee every category has a working
 * counterparty. They are held to the same standard as everyone else and are
 * ranked by the same rules, including when a third party beats them (invariant 1
 * / 17). `isReferenceAgent` and `referenceMarkHref` are how a surface labels
 * them so one is never mistaken for third-party supply.
 */

export interface ReferenceAgent {
  /** Stable id used everywhere: agentId on runs, receipts, charters, the Ledger. */
  id: `marque:${string}`
  slug: string
  /** THE display name. Never write another. */
  name: string
  category: 'rebalancing' | 'grid' | 'yield' | 'health_factor' | 'security'
  /** One line, for a row subtitle. */
  blurb: string
  /** env var holding the agent's public base URL, if it is served. */
  publicUrlEnv: string
  /** Local port behind Caddy (ecosystem.config.cjs). */
  port: number
  /**
   * ERC-8004 identity on BSC testnet (chain 97). Re-minted 2026-09-08 after the
   * P10.5C keystore regeneration; the pre-recovery token ids are dead. The
   * `bag erc8004 register` path was blocked by an 8004scan outage, so these were
   * minted by calling the identity registry directly — see
   * scripts/register-agents-direct.mjs.
   */
  erc8004: { chainId: 97; tokenId: number; wallet: `0x${string}` }
}

/** The ERC-8004 IdentityRegistry these were minted on (BSC testnet). */
export const ERC8004_REGISTRY_TESTNET = '0x8004a818bFB912233c491871B3d84C89A494bd9E' as const

export const REFERENCE_AGENTS: readonly ReferenceAgent[] = [
  { id: 'marque:bound', slug: 'bound', name: 'Bound', category: 'rebalancing', port: 8611,
    blurb: 'PancakeSwap V3 range health and a bounded re-centre plan.', publicUrlEnv: 'BOUND_PUBLIC_URL',
    erc8004: { chainId: 97, tokenId: 2234, wallet: '0x5B1c9fBc684a1722Bb5C66C0B22F149dA69768d6' } },
  { id: 'marque:lattice', slug: 'lattice', name: 'Lattice', category: 'grid', port: 8612,
    blurb: 'Constrained grid plans with fee drag disclosed.', publicUrlEnv: 'LATTICE_PUBLIC_URL',
    erc8004: { chainId: 97, tokenId: 2236, wallet: '0x5aAF7b5B2170986C59279682Bd714c475ae8C718' } },
  { id: 'marque:sluicegate', slug: 'sluicegate', name: 'Sluicegate', category: 'yield', port: 8613,
    blurb: 'Net-APR-at-size yield routing across BNB Chain venues.', publicUrlEnv: 'SLUICEGATE_PUBLIC_URL',
    erc8004: { chainId: 97, tokenId: 2237, wallet: '0x253F7Ad5D52099C4a2293418a661e9974DfB5e84' } },
  { id: 'marque:keel', slug: 'keel', name: 'Keel', category: 'health_factor', port: 8610,
    blurb: 'Venus health factor, liquidation price and the exact restore amount.', publicUrlEnv: 'KEEL_PUBLIC_URL',
    erc8004: { chainId: 97, tokenId: 2238, wallet: '0xdF1074a272C53A1a10b96Fa0201Eb58bbbaaFe00' } },
  { id: 'marque:redcell', slug: 'redcell', name: 'Redcell', category: 'security', port: 8614,
    blurb: 'BNB Chain approval and privileged-function risk triage.', publicUrlEnv: 'REDCELL_PUBLIC_URL',
    erc8004: { chainId: 97, tokenId: 2239, wallet: '0x1F0D0eF5a279888E3b86c8a99A8A99F19fCEc587' } },
] as const

const BY_ID = new Map(REFERENCE_AGENTS.map((a) => [a.id, a]))
const BY_SLUG = new Map(REFERENCE_AGENTS.map((a) => [a.slug, a]))

export function isReferenceAgent(agentId: string | null | undefined): boolean {
  if (!agentId) return false
  return BY_ID.has(agentId as ReferenceAgent['id']) || /^marque:/i.test(agentId)
}

export function referenceAgent(idOrSlug: string | null | undefined): ReferenceAgent | undefined {
  if (!idOrSlug) return undefined
  return BY_ID.get(idOrSlug as ReferenceAgent['id']) ?? BY_SLUG.get(idOrSlug)
}

/** THE name for an agent id: the reference name if it is ours, else the fallback. */
export function displayName(agentId: string | null | undefined, fallback?: string | null): string {
  const ref = referenceAgent(agentId ?? undefined)
  if (ref) return ref.name
  return fallback?.trim() || (agentId ? String(agentId) : 'Unnamed agent')
}

/** Where the "Marque reference agent" mark links — the one-line explanation. */
export const referenceMarkHref = '/register#reference-agents'

/** For a reference agent by category, e.g. the Charter Desk's fallback supplier. */
export function referenceAgentForCategory(category: string): ReferenceAgent | undefined {
  return REFERENCE_AGENTS.find((a) => a.category === category)
}
