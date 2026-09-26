import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Marque's own reference agents (AGENTS invariant 29).
 *
 * The single source is `config/first-party.json` at the repo root: chain id, token id,
 * slug and owner for each. Every other field (name, services, wallet) is read from the
 * ERC-8004 row like any third party. Legacy `marque:*` ids map here for old records.
 */
export interface FirstPartyAgent {
  chainId: number
  tokenId: number
  slug: string
  category: 'rebalancing' | 'grid' | 'yield' | 'health_factor' | 'security'
  owner: `0x${string}`
  legacyId: string
  testnet?: { chainId: number; tokenId: number }
}

let cached: FirstPartyAgent[] | null = null
let registries: Record<string, string> = {}

function locate(): string | null {
  const starts = [process.env.MARQUE_ROOT, process.cwd()].filter((s): s is string => Boolean(s))
  for (const start of starts) {
    let dir = path.resolve(start)
    for (let i = 0; i < 6; i++) {
      const p = path.join(dir, 'config', 'first-party.json')
      if (existsSync(p)) return p
      const up = path.dirname(dir)
      if (up === dir) break
      dir = up
    }
  }
  return null
}

export function firstPartyAgents(): FirstPartyAgent[] {
  if (cached) return cached
  const p = locate()
  if (!p) throw new Error('config/first-party.json not found (set MARQUE_ROOT to the repo root)')
  const parsed = JSON.parse(readFileSync(p, 'utf8')) as { agents?: FirstPartyAgent[]; identityRegistry?: Record<string, string> }
  registries = parsed.identityRegistry ?? {}
  cached = (parsed.agents ?? []).map((a) => ({ ...a, owner: a.owner.toLowerCase() as `0x${string}` }))
  return cached
}

/** `chainId:tokenId` keys, the stable identity a row is matched on. */
export function firstPartyKeys(): Set<string> {
  return new Set(firstPartyAgents().map((a) => `${a.chainId}:${a.tokenId}`))
}

export function isFirstParty(chainId: number, tokenId: string | number): boolean {
  return firstPartyKeys().has(`${chainId}:${tokenId}`)
}

export function firstPartyByLegacyId(legacyId: string): FirstPartyAgent | undefined {
  return firstPartyAgents().find((a) => a.legacyId === legacyId)
}

/**
 * The canonical `agent.id` of a first-party identity: `chainId:registry:tokenId`, the same
 * key ingest writes. Derived from config, so it needs no database round trip.
 */
export function canonicalAgentId(a: Pick<FirstPartyAgent, 'chainId' | 'tokenId'>): string {
  firstPartyAgents()
  const reg = registries[String(a.chainId)]
  if (!reg) throw new Error(`config/first-party.json has no identityRegistry for chain ${a.chainId}`)
  return `${a.chainId}:${reg.toLowerCase()}:${a.tokenId}`
}

/**
 * Every id a first-party agent's records may carry: the legacy `marque:<slug>` id used by
 * older runs, receipts and conformance results, and the canonical ERC-8004 row id used
 * from Phase 2 on. Any query that says "third party" must exclude all of them.
 */
export function firstPartyIds(): string[] {
  return firstPartyAgents().flatMap((a) => [a.legacyId, canonicalAgentId(a)])
}

/** Maps any first-party id to its legacy id, so both count as one agent. */
export function firstPartyIdMap(): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of firstPartyAgents()) {
    m.set(a.legacyId, a.legacyId)
    m.set(canonicalAgentId(a), a.legacyId)
  }
  return m
}
