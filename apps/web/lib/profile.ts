import 'server-only'
import { desc, eq, sql } from 'drizzle-orm'
import { db, charter as charterTable, run as runTable, receipt as receiptTable, sealedCall } from '@marque/db'
import { formatEther } from 'viem'
import { publicClient } from '@marque/chain'
import { viewFromRow, type CharterView } from './charters'

/**
 * The profile — everything Marque already knows about ONE address, assembled.
 *
 * This is a projection, not a new record. Nothing here is stored about a
 * wallet: it reads rows that already exist keyed by address (a charter's
 * owner, a run's subject, a seal's subject) and two facts off chain (native
 * balance, transaction count). No account, no session, no cookie — the wallet
 * is still the identity, and pasting an address reaches all of this the same
 * way it reaches /positions.
 *
 * Live positions are deliberately NOT included here: they are a chain read that
 * belongs to /api/v1/positions, and the profile page composes the two so a slow
 * RPC never holds up the parts that come from our own tables.
 */

export interface ProfileChainFacts {
  /** Native BNB balance in ether units, or null if the RPC did not answer. */
  nativeBalance: number | null
  /** Transaction count (nonce). null if the RPC did not answer. */
  txCount: number | null
  /** Chain head at read time. */
  blockNumber: string | null
}

export interface ProfileRun {
  id: string
  agentId: string
  agentName: string | null
  category: string
  kind: string
  status: string
  ok: boolean | null
  failure: string | null
  feeUsd: number | null
  startedAt: string
  finishedAt: string | null
  hasReceipt: boolean
  receiptAnchored: boolean
}

export interface ProfileSeal {
  hash: string
  agentId: string
  category: string
  blockNumber: string
  issuedAt: string
  outcome: string
  resolvedAt: string | null
  chainId: number
  sealTxHash: string | null
}

export interface ActivityItem {
  /** ISO timestamp the thing actually happened at. */
  at: string
  kind: 'charter_granted' | 'charter_revoked' | 'charter_expired'
      | 'hire_started' | 'hire_finished' | 'receipt_issued'
      | 'seal_issued' | 'seal_resolved'
  label: string
  detail: string | null
  href: string | null
  /** Where the fact comes from, shown as a chip. */
  provenance: 'MEASURED' | 'ONCHAIN'
}

export interface ProfileView {
  address: string
  /** Earliest moment this address appears anywhere in Marque's own records. */
  firstSeen: string | null
  chain: ProfileChainFacts
  charters: {
    all: CharterView[]
    activeCount: number
    /** Cumulative calls made under this address's charters. */
    callsUsed: number
  }
  hires: {
    all: ProfileRun[]
    okCount: number
    failedCount: number
    /** Distinct agent ids hired for this address. */
    agents: string[]
    /** Sum of recorded fees, USD. Absent fees are not counted as zero. */
    feeUsdTotal: number
  }
  receipts: {
    count: number
    anchoredCount: number
    latestId: string | null
  }
  seals: {
    all: ProfileSeal[]
    byOutcome: Record<string, number>
  }
  activity: ActivityItem[]
}

const lower = (addr: string) => addr.toLowerCase()

/**
 * Merge every dated record for an address into one newest-first timeline.
 *
 * Pure so it can be tested without a database. Each source contributes the
 * events it actually witnessed — a charter contributes its grant and, if it
 * ended, the end; a run contributes its start and, if finished, its finish.
 * No intermediate steps are invented.
 */
export function mergeActivity(input: {
  charters: CharterView[]
  runs: ProfileRun[]
  seals: ProfileSeal[]
}): ActivityItem[] {
  const items: ActivityItem[] = []

  for (const c of input.charters) {
    const name = c.label ?? c.agentName ?? c.category
    items.push({
      at: c.grantedAt,
      kind: 'charter_granted',
      label: `Charter granted — ${name}`,
      detail: c.caps[0] ? `cap ${c.caps[0].limit} ${c.caps[0].symbol}` : null,
      href: '/app/charters',
      provenance: 'MEASURED',
    })
    if (c.revokedAt) {
      items.push({
        at: c.revokedAt,
        kind: 'charter_revoked',
        label: `Charter revoked — ${name}`,
        detail: c.revokeTxHash ? 'on chain' : null,
        href: '/app/charters',
        provenance: c.revokeTxHash ? 'ONCHAIN' : 'MEASURED',
      })
    } else if (c.status === 'expired') {
      items.push({
        at: c.expiresAt,
        kind: 'charter_expired',
        label: `Charter expired — ${name}`,
        detail: null,
        href: '/app/charters',
        provenance: 'MEASURED',
      })
    }
  }

  for (const r of input.runs) {
    const who = r.agentName ?? r.agentId
    items.push({
      at: r.startedAt,
      kind: 'hire_started',
      label: `Hired ${who}`,
      detail: r.category,
      href: `/runs/${r.id}`,
      provenance: 'MEASURED',
    })
    if (r.finishedAt) {
      items.push({
        at: r.finishedAt,
        kind: 'hire_finished',
        label: r.ok ? `${who} completed` : `${who} failed`,
        detail: r.ok ? (r.feeUsd != null ? `fee $${r.feeUsd.toFixed(2)}` : null) : r.failure,
        href: `/runs/${r.id}`,
        provenance: 'MEASURED',
      })
    }
    if (r.hasReceipt) {
      items.push({
        at: r.finishedAt ?? r.startedAt,
        kind: 'receipt_issued',
        label: 'Receipt issued',
        detail: r.receiptAnchored ? 'anchored on chain' : 'not anchored',
        href: `/receipts/${r.id}`,
        provenance: r.receiptAnchored ? 'ONCHAIN' : 'MEASURED',
      })
    }
  }

  for (const s of input.seals) {
    items.push({
      at: s.issuedAt,
      kind: 'seal_issued',
      label: `Recommendation sealed — ${s.category}`,
      detail: s.sealTxHash ? 'hash anchored before the outcome' : 'seal not anchored',
      href: '/ledger',
      provenance: s.sealTxHash ? 'ONCHAIN' : 'MEASURED',
    })
    if (s.resolvedAt) {
      items.push({
        at: s.resolvedAt,
        kind: 'seal_resolved',
        label: `Sealed call resolved — ${s.outcome}`,
        detail: null,
        href: '/ledger',
        provenance: 'MEASURED',
      })
    }
  }

  return items
    .filter((i) => i.at && !Number.isNaN(Date.parse(i.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

/** The earliest timestamp across every first-party record, or null. */
export function earliest(dates: Array<string | null | undefined>): string | null {
  const ts = dates
    .filter((d): d is string => Boolean(d) && !Number.isNaN(Date.parse(d as string)))
    .map((d) => Date.parse(d))
  return ts.length ? new Date(Math.min(...ts)).toISOString() : null
}

export async function readProfile(address: string): Promise<ProfileView> {
  const addr = lower(address)

  const [charterRows, runRows, sealRows, chain] = await Promise.all([
    db().select().from(charterTable)
      .where(sql`lower(${charterTable.ownerAddress}) = ${addr}`)
      .orderBy(desc(charterTable.grantedAt)),
    db().select({
      id: runTable.id,
      agentId: runTable.agentId,
      agentName: runTable.agentName,
      category: runTable.category,
      kind: runTable.kind,
      status: runTable.status,
      ok: runTable.ok,
      failure: runTable.failure,
      feeUsd: runTable.feeUsd,
      startedAt: runTable.startedAt,
      finishedAt: runTable.finishedAt,
      receiptId: receiptTable.id,
      receiptAnchor: receiptTable.anchorTxHash,
    })
      .from(runTable)
      .leftJoin(receiptTable, eq(receiptTable.runId, runTable.id))
      .where(sql`lower(${runTable.subject}) = ${addr}`)
      .orderBy(desc(runTable.startedAt)),
    db().select().from(sealedCall)
      .where(sql`lower(${sealedCall.subject}) = ${addr}`)
      .orderBy(desc(sealedCall.issuedAt)),
    readChainFacts(address),
  ])

  const charters: CharterView[] = charterRows.map((r) => viewFromRow(r))

  const hires: ProfileRun[] = runRows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    agentName: r.agentName,
    category: r.category,
    kind: r.kind,
    status: r.status,
    ok: r.ok,
    failure: r.failure,
    feeUsd: r.feeUsd,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    hasReceipt: r.receiptId != null,
    receiptAnchored: r.receiptAnchor != null,
  }))

  const seals: ProfileSeal[] = sealRows.map((r) => ({
    hash: r.hash,
    agentId: r.agentId,
    category: r.category,
    blockNumber: r.blockNumber,
    issuedAt: r.issuedAt.toISOString(),
    outcome: r.outcome,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    chainId: r.chainId,
    sealTxHash: r.sealTxHash,
  }))

  const byOutcome: Record<string, number> = {}
  for (const s of seals) byOutcome[s.outcome] = (byOutcome[s.outcome] ?? 0) + 1

  const receiptCount = hires.filter((r) => r.hasReceipt).length
  const anchoredCount = hires.filter((r) => r.receiptAnchored).length
  const latestReceipt = hires.find((r) => r.hasReceipt)?.id ?? null

  const firstSeen = earliest([
    ...charters.map((c) => c.grantedAt),
    ...hires.map((r) => r.startedAt),
    ...seals.map((s) => s.issuedAt),
  ])

  return {
    address,
    firstSeen,
    chain,
    charters: {
      all: charters,
      activeCount: charters.filter((c) => c.status === 'active').length,
      callsUsed: charters.reduce((s, c) => s + (c.callsUsed ?? 0), 0),
    },
    hires: {
      all: hires,
      okCount: hires.filter((r) => r.ok === true).length,
      failedCount: hires.filter((r) => r.ok === false).length,
      agents: [...new Set(hires.map((r) => r.agentId))],
      feeUsdTotal: hires.reduce((s, r) => s + (r.feeUsd ?? 0), 0),
    },
    receipts: {
      count: receiptCount,
      anchoredCount,
      latestId: latestReceipt,
    },
    seals: { all: seals, byOutcome },
    activity: mergeActivity({ charters, runs: hires, seals }),
  }
}

async function readChainFacts(address: string): Promise<ProfileChainFacts> {
  try {
    const client = publicClient()
    const [balance, txCount, blockNumber] = await Promise.all([
      client.getBalance({ address: address as `0x${string}` }),
      client.getTransactionCount({ address: address as `0x${string}` }),
      client.getBlockNumber(),
    ])
    return {
      nativeBalance: Number(formatEther(balance)),
      txCount: Number(txCount),
      blockNumber: blockNumber.toString(),
    }
  } catch {
    // A chain read failing is not a reason to blank the profile — the
    // first-party sections still stand. The UI shows these as unavailable.
    return { nativeBalance: null, txCount: null, blockNumber: null }
  }
}
