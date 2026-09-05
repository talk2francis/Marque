import type { Charter, CharterGrant, CharterStatus } from './types.js'

/**
 * Where charters live between processes.
 *
 * A charter held only in a Map dies with the process, and a product whose
 * revoke button disappears on deploy has not shipped revocation — it has shipped
 * a screenshot of revocation. AGENTS.md invariant 12 puts charters in the
 * first-party tier for exactly this reason: what was granted and what was
 * revoked are things that happened, and they are never recreatable.
 *
 * The store holds the DOCUMENT — policy, hashes, transactions, usage. It never
 * holds session key material. Altana's session signer stays in process memory
 * and dies with the process by design; the durable, third-party-verifiable
 * record is the on-chain anchor plus the policy hash, both of which are here.
 */

export interface CharterRecord {
  charter: Charter
  policyHash: string
  revokeHash: string | null
  /** symbol -> cumulative spend, smallest units, as a decimal string. */
  spent: Record<string, string>
  callsUsed: number
  agentName: string | null
  grantedBy: string
  label: string | null
  /** The Marque category the charter was drawn for. */
  category: string
}

export interface CharterStore {
  put(record: CharterRecord): Promise<void>
  get(id: string): Promise<CharterRecord | null>
  /** Newest first. `status` filters, absent means every status. */
  list(opts?: { status?: CharterStatus; limit?: number }): Promise<CharterRecord[]>
  patch(id: string, patch: Partial<Omit<CharterRecord, 'charter'>> & {
    status?: CharterStatus
    revokedAt?: string | null
    revokeTxHash?: string | null
  }): Promise<void>
}

/** For tests and for scripts that do not want a database. */
export class InMemoryCharterStore implements CharterStore {
  private readonly rows = new Map<string, CharterRecord>()

  async put(record: CharterRecord): Promise<void> {
    this.rows.set(record.charter.id, structuredCloneRecord(record))
  }

  async get(id: string): Promise<CharterRecord | null> {
    const row = this.rows.get(id)
    return row ? structuredCloneRecord(row) : null
  }

  async list(opts?: { status?: CharterStatus; limit?: number }): Promise<CharterRecord[]> {
    const all = [...this.rows.values()]
      .filter((r) => !opts?.status || r.charter.status === opts.status)
      .sort((a, b) => b.charter.grantedAt.localeCompare(a.charter.grantedAt))
    return all.slice(0, opts?.limit ?? all.length).map(structuredCloneRecord)
  }

  async patch(id: string, patch: Parameters<CharterStore['patch']>[1]): Promise<void> {
    const row = this.rows.get(id)
    if (!row) return
    if (patch.status) row.charter.status = patch.status
    if (patch.revokedAt !== undefined) row.charter.revokedAt = patch.revokedAt
    if (patch.revokeTxHash !== undefined) row.charter.revokeTxHash = patch.revokeTxHash
    if (patch.revokeHash !== undefined) row.revokeHash = patch.revokeHash
    if (patch.spent !== undefined) row.spent = { ...patch.spent }
    if (patch.callsUsed !== undefined) row.callsUsed = patch.callsUsed
  }
}

/** bigint does not survive structuredClone through JSON; clone by hand. */
function structuredCloneRecord(r: CharterRecord): CharterRecord {
  return {
    ...r,
    spent: { ...r.spent },
    charter: { ...r.charter, grant: cloneGrant(r.charter.grant) },
  }
}

function cloneGrant(g: CharterGrant): CharterGrant {
  return {
    ...g,
    calls: g.calls.map((c) => ({ ...c, selectors: c.selectors ? [...c.selectors] : undefined })),
    spend: g.spend.map((s) => ({ ...s })),
  }
}

// ---------------------------------------------------------------------------
// Serialisation
//
// Spend limits are bigints in 18-decimal units and routinely exceed 2^53.
// JSON.stringify turns a bigint into a throw and Number() turns it into a lie,
// so every limit crosses the storage boundary as a DECIMAL STRING and comes
// back as a bigint. This is the same class of bug as the USDT-decimals trap:
// silent, arithmetic, and it produces a charter that cannot execute.
// ---------------------------------------------------------------------------

export function serialiseGrant(grant: CharterGrant): Record<string, unknown> {
  return {
    owner: grant.owner,
    agentId: grant.agentId,
    chainId: grant.chainId,
    expiresAt: grant.expiresAt,
    calls: grant.calls.map((c) => ({
      to: c.to,
      ...(c.selectors ? { selectors: c.selectors } : {}),
      ...(c.label ? { label: c.label } : {}),
    })),
    spend: grant.spend.map((s) => ({
      limit: s.limit.toString(),
      period: s.period,
      ...(s.token ? { token: s.token } : {}),
      decimals: s.decimals,
      symbol: s.symbol,
    })),
  }
}

export function deserialiseGrant(raw: unknown): CharterGrant {
  const g = raw as Record<string, unknown>
  const calls = (g['calls'] as Array<Record<string, unknown>>).map((c) => ({
    to: String(c['to']),
    ...(Array.isArray(c['selectors']) ? { selectors: (c['selectors'] as string[]).map(String) } : {}),
    ...(c['label'] ? { label: String(c['label']) } : {}),
  }))
  const spend = (g['spend'] as Array<Record<string, unknown>>).map((s) => ({
    limit: BigInt(String(s['limit'])),
    period: s['period'] as 'day' | 'week' | 'total',
    ...(s['token'] ? { token: String(s['token']) } : {}),
    decimals: Number(s['decimals']),
    symbol: String(s['symbol']),
  }))
  return {
    owner: String(g['owner']),
    agentId: String(g['agentId']),
    chainId: Number(g['chainId']),
    expiresAt: Number(g['expiresAt']),
    calls,
    spend,
  }
}
