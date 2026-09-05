import 'server-only'
import { and, desc, eq, gt } from 'drizzle-orm'
import { db, charter as charterTable } from '@marque/db'
import { DbCharterStore } from '@marque/mandates/stores/db'
import { RegistryCharterService } from '@marque/mandates/registry'
import { deserialiseGrant } from '@marque/mandates/store'
import type { CharterGrant, CharterState } from '@marque/mandates/types'

/**
 * The charter service, as the web process sees it.
 *
 * Every surface speaks `CharterService` and never a vendor SDK — that is the
 * whole point of building the interface first (AGENTS.md P6-lite). The web
 * process uses the REGISTRY implementation, and says so on screen, because it
 * is the one that survives a restart: its authority is the operator key plus a
 * durable Postgres record, so a charter granted before a deploy still has a
 * working revoke button afterwards. Altana's implementation holds its session
 * signer in process memory by design, which is correct for a key and wrong for
 * a marketplace's only revoke path.
 *
 * The difference between the two is real and the UI states it rather than
 * letting a reader assume equivalence:
 *
 *   registry  policy anchored on chain and publicly readable; enforced by this
 *             service before it signs.
 *   altana    policy enforced by the relay, which reverts at the contract.
 */

export const CHARTER_CHAIN_ID = 97
export const CHARTER_CHAIN_NAME = 'BNB Smart Chain testnet'

let service: RegistryCharterService | null = null

export function charterService(): RegistryCharterService {
  if (service) return service
  const registryAddress = process.env['MARQUE_REGISTRY_ADDRESS_TESTNET']
  const privateKey = process.env['MARQUE_TESTNET_PK']
  const rpcUrl = process.env['BSC_TESTNET_RPC']
  if (!registryAddress || !privateKey || !rpcUrl) {
    throw new Error('charter service is not configured on this deployment')
  }
  service = new RegistryCharterService({
    registryAddress: registryAddress as `0x${string}`,
    privateKey: privateKey as `0x${string}`,
    rpcUrl,
    chainId: CHARTER_CHAIN_ID,
    store: new DbCharterStore(),
  })
  return service
}

export function charterServiceAvailable(): boolean {
  return Boolean(
    process.env['MARQUE_REGISTRY_ADDRESS_TESTNET']
    && process.env['MARQUE_TESTNET_PK']
    && process.env['BSC_TESTNET_RPC'],
  )
}

// ---------------------------------------------------------------------------
// Reads. These go to the database for the DOCUMENT and to chain for the STATE.
// ---------------------------------------------------------------------------

export interface CharterView {
  id: string
  provider: string
  status: string
  agentId: string
  agentName: string | null
  category: string
  ownerAddress: string
  sessionKeyAddress: string | null
  grantTxHash: string | null
  revokeTxHash: string | null
  policyHash: string
  label: string | null
  grantedAt: string
  expiresAt: string
  revokedAt: string | null
  callsUsed: number
  /** Per-cap spend, in human units, with the raw smallest-unit values kept. */
  caps: Array<{
    symbol: string
    decimals: number
    limitRaw: string
    spentRaw: string
    limit: number
    spent: number
    remaining: number
    period: string
  }>
  contracts: Array<{ to: string; label: string | null; selectors: string[] }>
  /** Seconds until expiry at read time. Negative once expired. */
  secondsRemaining: number
  /** True only when the status was resolved against chain on this read. */
  fromChain: boolean
  blockNumber: string | null
}

function viewFromRow(row: typeof charterTable.$inferSelect, live?: CharterState): CharterView {
  const grant: CharterGrant = deserialiseGrant(row.policy)
  const spent = row.spent ?? {}
  const now = Date.now()
  const secondsRemaining = live
    ? live.secondsRemaining
    : Math.floor((row.expiresAt.getTime() - now) / 1000)

  // Status precedence, and the chain wins wherever it has an opinion:
  // revoked beats expired beats active. A cached "active" that contradicts an
  // on-chain revocation is the most dangerous thing this product could show.
  const status = live?.status
    ?? (row.status === 'active' && secondsRemaining <= 0 ? 'expired' : row.status)

  return {
    id: row.id,
    provider: row.provider,
    status,
    agentId: row.agentId,
    agentName: row.agentName,
    category: row.category,
    ownerAddress: row.ownerAddress,
    sessionKeyAddress: row.sessionKeyAddress,
    grantTxHash: row.grantTxHash,
    revokeTxHash: row.revokeTxHash,
    policyHash: row.policyHash,
    label: row.label,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    callsUsed: live?.callsUsed ?? row.callsUsed,
    caps: grant.spend.map((s) => {
      const spentRaw = BigInt(spent[s.symbol] ?? '0')
      const limit = Number(s.limit) / 10 ** s.decimals
      const used = Number(spentRaw) / 10 ** s.decimals
      return {
        symbol: s.symbol,
        decimals: s.decimals,
        limitRaw: s.limit.toString(),
        spentRaw: spentRaw.toString(),
        limit,
        spent: used,
        remaining: Math.max(limit - used, 0),
        period: s.period,
      }
    }),
    contracts: grant.calls.map((c) => ({
      to: c.to,
      label: c.label ?? null,
      selectors: c.selectors ?? [],
    })),
    secondsRemaining,
    fromChain: Boolean(live?.fromChain),
    blockNumber: live?.blockNumber ?? null,
  }
}

/** One charter, with its live state read from chain where the service can. */
export async function readCharter(id: string): Promise<CharterView | null> {
  const [row] = await db().select().from(charterTable).where(eq(charterTable.id, id)).limit(1)
  if (!row) return null

  let live: CharterState | undefined
  try {
    live = await charterService().state(id)
  } catch {
    // A chain read failing is not a reason to hide the charter, but it IS a
    // reason to stop claiming the status came from chain. fromChain stays false
    // and the UI says the state is from our record.
    live = undefined
  }

  // Expiry that the clock has passed is a state change with no transaction
  // behind it, so it is written back rather than recomputed on every read.
  const view = viewFromRow(row, live)
  if (row.status === 'active' && view.status !== 'active') {
    await db().update(charterTable).set({ status: view.status as 'expired' }).where(eq(charterTable.id, id))
  }
  return view
}

/** Every charter, newest first. Includes the dead ones — we publish failures. */
export async function listCharters(limit = 40): Promise<CharterView[]> {
  const rows = await db().select().from(charterTable)
    .orderBy(desc(charterTable.grantedAt)).limit(limit)
  return rows.map((r) => viewFromRow(r))
}

/**
 * The charters the header strip cares about: granted, unrevoked, unexpired.
 *
 * Deliberately a single cheap query with no chain call. The strip is on every
 * page, and a header that costs an RPC round trip per navigation is a header
 * that gets removed. The Charter page does the chain read.
 */
export async function activeCharters(): Promise<CharterView[]> {
  const rows = await db().select().from(charterTable)
    .where(and(eq(charterTable.status, 'active'), gt(charterTable.expiresAt, new Date())))
    .orderBy(desc(charterTable.grantedAt))
    .limit(10)
  return rows.map((r) => viewFromRow(r))
}
