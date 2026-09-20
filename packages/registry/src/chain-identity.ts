import { sql } from 'drizzle-orm'
import { db, agent, type NewAgent } from '@marque/db'
import { multicallAllowFailure, read, type ReadCall } from '@marque/chain'

/**
 * PASS 0. The registry itself, read from the chain.
 *
 * Every other pass trusts 8004scan's list. That list is authoritative about
 * what 8004scan could resolve, not about what exists: the ERC-8004 identity
 * contract has minted ~354,400 tokens on BSC, and 8004scan lists ~322,800 of
 * them. The ~31,600 difference is not an indexing lag we can sweep away — they
 * are real identities with real owners that the aggregator simply does not
 * carry, many of them with an empty tokenURI.
 *
 * A marketplace whose headline is "registered on BNB Smart Chain" should count
 * the chain. So this walks the token id space directly and inserts whatever is
 * missing, with the owner read from `ownerOf`.
 *
 * What it deliberately does NOT do:
 *
 *   - It never overwrites anything 8004scan gave us. On conflict it touches
 *     `last_seen`, and fills `owner_address` only when we had none. Name,
 *     description, image, protocols and every enrichment field are left alone.
 *   - It writes no protocols and no x402 flag, which keeps these rows out of
 *     `enrichDetails` (it selects on a2a/mcp/x402) so they cannot starve the
 *     enrichment queue or spend API budget on agents 8004scan has never heard
 *     of.
 *   - With no service row and no probe, they are also invisible to the
 *     marketplace query, which requires a live probe or a conformance result.
 *     They raise the registry count without ever appearing as hireable supply
 *     they are not.
 */

const OWNER_OF_ABI = [
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

export const BSC_IDENTITY_REGISTRY = (process.env['BSC_ERC8004_REGISTRY']
  ?? '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432') as `0x${string}`

export interface ChainSweepResult {
  /** Token ids examined this invocation. */
  scanned: number
  /** Ids that resolved to an owner. */
  existing: number
  /** Rows inserted (agents we did not already hold). */
  inserted: number
  /** Where the next invocation resumes. */
  cursor: number
  /** Highest token id known to exist, as discovered by the boundary probe. */
  highestId: number
  /** True when the walk reached the top and reset for another pass. */
  completedPass: boolean
  /** 'frontier' scans only ids above what we hold; 'full' re-walks everything. */
  mode: 'frontier' | 'full'
}

function ownerCall(registry: `0x${string}`, id: number): ReadCall {
  return { address: registry, abi: OWNER_OF_ABI as never, functionName: 'ownerOf', args: [BigInt(id)] }
}

async function idExists(registry: `0x${string}`, id: number): Promise<boolean> {
  try {
    await read<string>(ownerCall(registry, id))
    return true
  } catch {
    return false
  }
}

/**
 * The highest minted token id. `totalSupply` reverts on this contract — it is
 * not enumerable — so the top is found by doubling past the end and then
 * bisecting, which costs ~20 reads rather than a scan.
 */
export async function highestTokenId(
  registry: `0x${string}` = BSC_IDENTITY_REGISTRY,
  knownFloor = 1,
): Promise<number> {
  let lo = knownFloor
  if (!(await idExists(registry, lo))) return 0
  let hi = Math.max(2, lo * 2)
  // Double until we overshoot, capped so a pathological registry cannot spin.
  for (let i = 0; i < 40 && (await idExists(registry, hi)); i++) {
    lo = hi
    hi *= 2
  }
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (await idExists(registry, mid)) lo = mid
    else hi = mid
  }
  return lo
}

const CURSOR_SOURCE = (chainId: number) => `chain:identity:${chainId}`

/** postgres-js hands back a bare array; other drivers wrap it in `.rows`. */
function resultRows<T>(r: unknown): T[] {
  const maybe = (r as { rows?: unknown }).rows
  if (Array.isArray(maybe)) return maybe as T[]
  return Array.isArray(r) ? (r as T[]) : []
}

interface ChainState {
  cursor: number
  highestId: number
  /** Highest id we have confirmed indexed. Everything at or below is done. */
  frontier: number
  /** When the last full reconciliation finished. */
  lastFullAt: number
  /** A full pass that has not reached the top yet. */
  fullInProgress: boolean
}

async function readState(chainId: number): Promise<ChainState> {
  const rows = await db().execute(sql`
    select cursor, detail from ingest_cursor where source = ${CURSOR_SOURCE(chainId)} limit 1
  `)
  const row = resultRows<Record<string, unknown>>(rows)[0]
  const empty: ChainState = { cursor: 0, highestId: 0, frontier: -1, lastFullAt: 0, fullInProgress: false }
  if (!row) return empty
  const d = (row['detail'] ?? {}) as Record<string, unknown>
  const num = (k: string, fallback: number) => (typeof d[k] === 'number' ? (d[k] as number) : fallback)
  return {
    cursor: Number(row['cursor'] ?? 0),
    highestId: num('highestId', 0),
    frontier: num('frontier', -1),
    lastFullAt: num('lastFullAt', 0),
    fullInProgress: d['fullInProgress'] === true,
  }
}

/** The highest token id already in the table — used to seed the frontier once. */
async function highestIndexed(chainId: number, registry: string): Promise<number> {
  const r = await db().execute(sql`
    select coalesce(max(token_id::bigint), -1)::bigint as m
    from agent
    where chain_id = ${chainId} and contract_address = ${registry.toLowerCase()}
      and token_id ~ '^[0-9]+$'
  `)
  return Number(resultRows<{ m: string | number }>(r)[0]?.m ?? -1)
}

async function writeState(chainId: number, cursor: number, detail: Record<string, unknown>): Promise<void> {
  await db().execute(sql`
    insert into ingest_cursor (source, cursor, detail, updated_at)
    values (${CURSOR_SOURCE(chainId)}, ${cursor}, ${JSON.stringify(detail)}::jsonb, now())
    on conflict (source) do update
      set cursor = excluded.cursor, detail = excluded.detail, updated_at = excluded.updated_at
  `)
}

/**
 * Insert-only upsert.
 *
 * `onConflictDoUpdate` is deliberately narrow: an agent 8004scan already
 * described must come out of this untouched apart from its heartbeat, and an
 * owner we already know must never be clobbered by a stale read.
 */
async function insertChainAgents(rows: NewAgent[]): Promise<number> {
  if (rows.length === 0) return 0
  // Postgres sets xmax to 0 on a genuine INSERT and non-zero when ON CONFLICT
  // turned it into an UPDATE. Reading it back is exact and free — the previous
  // count-before/count-after pair ran two sequential scans of a 300k+ row table
  // for every 400 ids, which dominated the walk.
  const written = await db().insert(agent).values(rows).onConflictDoUpdate({
    target: agent.id,
    set: {
      lastSeen: sql`excluded.last_seen`,
      ownerAddress: sql`coalesce(${agent.ownerAddress}, excluded.owner_address)`,
    },
  }).returning({ fresh: sql<boolean>`(xmax = 0)` })

  return written.reduce((n, r) => n + (r.fresh ? 1 : 0), 0)
}

export async function sweepChainIdentities(opts: {
  chainId?: number
  registry?: `0x${string}`
  /** Token ids to examine in one invocation. */
  maxIds?: number
  /** Ids per multicall. */
  batchSize?: number
  /** Force a full re-walk of the id space. */
  full?: boolean
  /** How stale a full reconciliation may get before one is scheduled. */
  fullEveryMs?: number
  restart?: boolean
} = {}): Promise<ChainSweepResult> {
  const chainId = opts.chainId ?? 56
  const registry = opts.registry ?? BSC_IDENTITY_REGISTRY
  const maxIds = opts.maxIds ?? 20_000
  const batchSize = opts.batchSize ?? 400
  const fullEveryMs = opts.fullEveryMs ?? 24 * 60 * 60_000

  const st = opts.restart
    ? { cursor: 0, highestId: 0, frontier: -1, lastFullAt: 0, fullInProgress: false }
    : await readState(chainId)

  const highestId = await highestTokenId(registry, Math.max(1, st.highestId))
  if (highestId === 0) {
    return { scanned: 0, existing: 0, inserted: 0, cursor: 0, highestId: 0, completedPass: false, mode: 'frontier' }
  }

  // Seed the frontier from the table the first time, so an existing install
  // does not re-walk everything just because this field is new.
  let frontier = st.frontier
  if (frontier < 0) frontier = await highestIndexed(chainId, registry)

  /*
   * Steady state is a frontier scan. The registry mints sequentially, so once
   * the id space has been walked the only ids that can be new are the ones
   * above the highest we hold — usually a few hundred, often none. Re-walking
   * all ~354k every pass cost 354k reads and 354k no-op upserts, and every one
   * of those upserts left a dead tuple: the agent table reached 1.6M dead rows
   * against 354k live, which is what put Postgres into constant disk reads.
   *
   * A full reconciliation still runs, but on a slow schedule, to catch anything
   * a frontier scan structurally cannot (a gap left by an earlier failure).
   */
  const wantFull = opts.full === true || opts.restart === true || st.fullInProgress
    || st.lastFullAt === 0 || Date.now() - st.lastFullAt >= fullEveryMs
  const mode: 'frontier' | 'full' = wantFull ? 'full' : 'frontier'

  let cursor = mode === 'full' ? (st.fullInProgress ? st.cursor : 0) : frontier + 1
  const stopAt = highestId

  let scanned = 0
  let existing = 0
  let inserted = 0
  let completedPass = false

  while (scanned < maxIds && cursor <= stopAt) {
    const ids: number[] = []
    for (let i = 0; i < batchSize && cursor + i <= stopAt && scanned + i < maxIds; i++) ids.push(cursor + i)
    if (ids.length === 0) break

    let results
    try {
      results = await multicallAllowFailure<string>(ids.map((id) => ownerCall(registry, id)))
    } catch {
      break // leave the cursor put; the next invocation retries this slice
    }

    const rows: NewAgent[] = []
    for (let i = 0; i < ids.length; i++) {
      const r = results[i]
      if (!r || r.status !== 'success') continue
      existing++
      rows.push({
        id: `${chainId}:${registry.toLowerCase()}:${ids[i]}`,
        chainId,
        tokenId: String(ids[i]),
        contractAddress: registry.toLowerCase(),
        ownerAddress: String(r.result).toLowerCase(),
      } as NewAgent)
    }

    inserted += await insertChainAgents(rows)
    scanned += ids.length
    cursor += ids.length
  }

  const reachedTop = cursor > stopAt
  if (reachedTop) {
    completedPass = true
    frontier = stopAt
  } else if (mode === 'frontier') {
    // Partial frontier scan: only claim what was actually covered.
    frontier = Math.max(frontier, cursor - 1)
  }

  const fullDone = mode === 'full' && reachedTop
  await writeState(chainId, mode === 'full' && !reachedTop ? cursor : 0, {
    highestId,
    frontier,
    lastFullAt: fullDone ? Date.now() : st.lastFullAt,
    fullInProgress: mode === 'full' && !reachedTop,
    mode,
    lastScanned: scanned,
    lastInserted: inserted,
  })

  return { scanned, existing, inserted, cursor: reachedTop ? 0 : cursor, highestId, completedPass, mode }
}
