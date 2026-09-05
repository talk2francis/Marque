import { desc, eq } from 'drizzle-orm'
import { db, charter as charterTable } from '@marque/db'
import type { CharterStatus } from '../types.js'
import { deserialiseGrant, serialiseGrant, type CharterRecord, type CharterStore } from '../store.js'

/**
 * Postgres-backed charter store.
 *
 * FIRST-PARTY tier (AGENTS.md invariant 12): rows here record what was granted
 * and what was revoked. They are never deleted, not even to fix a migration.
 */
export class DbCharterStore implements CharterStore {
  async put(record: CharterRecord): Promise<void> {
    const c = record.charter
    const row = {
      id: c.id,
      provider: c.provider,
      chainId: c.grant.chainId,
      ownerAddress: c.grant.owner,
      agentId: c.grant.agentId,
      agentName: record.agentName,
      category: record.category as 'unclassified',
      status: c.status,
      policy: serialiseGrant(c.grant),
      policyHash: record.policyHash,
      revokeHash: record.revokeHash,
      sessionKeyAddress: c.sessionKeyAddress,
      grantTxHash: c.grantTxHash,
      revokeTxHash: c.revokeTxHash,
      verifyUrl: c.verifyUrl,
      expiresAt: new Date(c.grant.expiresAt * 1000),
      grantedAt: new Date(c.grantedAt),
      revokedAt: c.revokedAt ? new Date(c.revokedAt) : null,
      callsUsed: record.callsUsed,
      spent: record.spent,
      grantedBy: record.grantedBy,
      label: record.label,
    }
    await db().insert(charterTable).values(row).onConflictDoUpdate({
      target: charterTable.id,
      set: row,
    })
  }

  async get(id: string): Promise<CharterRecord | null> {
    const [row] = await db().select().from(charterTable).where(eq(charterTable.id, id)).limit(1)
    return row ? toRecord(row) : null
  }

  async list(opts?: { status?: CharterStatus; limit?: number }): Promise<CharterRecord[]> {
    const base = db().select().from(charterTable)
    const filtered = opts?.status ? base.where(eq(charterTable.status, opts.status)) : base
    const rows = await filtered.orderBy(desc(charterTable.grantedAt)).limit(opts?.limit ?? 50)
    return rows.map(toRecord)
  }

  async patch(id: string, patch: Parameters<CharterStore['patch']>[1]): Promise<void> {
    const set: Record<string, unknown> = {}
    if (patch.status !== undefined) set['status'] = patch.status
    if (patch.revokedAt !== undefined) set['revokedAt'] = patch.revokedAt ? new Date(patch.revokedAt) : null
    if (patch.revokeTxHash !== undefined) set['revokeTxHash'] = patch.revokeTxHash
    if (patch.revokeHash !== undefined) set['revokeHash'] = patch.revokeHash
    if (patch.spent !== undefined) set['spent'] = patch.spent
    if (patch.callsUsed !== undefined) set['callsUsed'] = patch.callsUsed
    if (Object.keys(set).length === 0) return
    await db().update(charterTable).set(set).where(eq(charterTable.id, id))
  }
}

function toRecord(row: typeof charterTable.$inferSelect): CharterRecord {
  return {
    charter: {
      id: row.id,
      status: row.status,
      grant: deserialiseGrant(row.policy),
      sessionKeyAddress: row.sessionKeyAddress,
      grantTxHash: row.grantTxHash,
      revokeTxHash: row.revokeTxHash,
      grantedAt: row.grantedAt.toISOString(),
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      provider: row.provider,
      verifyUrl: row.verifyUrl,
    },
    policyHash: row.policyHash,
    revokeHash: row.revokeHash,
    spent: row.spent ?? {},
    callsUsed: row.callsUsed,
    agentName: row.agentName,
    grantedBy: row.grantedBy,
    label: row.label,
    category: row.category,
  }
}
