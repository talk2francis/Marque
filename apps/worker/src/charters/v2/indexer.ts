import { sql } from 'drizzle-orm'
import { decodeEventLog, getAddress, parseAbi, type Abi, type Address, type Log, type PublicClient } from 'viem'
import { chartersDb as db } from '@marque/db'
import {
  V2, KIND_CODES, KIND_BY_CODE, factoryFor,
  loanGuardV2Abi, loanGuardFactoryV2Abi, yieldSweepAbi, yieldSweepFactoryAbi, gridBandAbi, gridBandFactoryAbi, rangeKeeperAbi, rangeKeeperFactoryAbi,
  type CharterChainId, type CharterKind,
} from '@marque/charters'

/**
 * The Charters v2 indexer (derived state, rebuildable from chain). Follows Created from the four factories and
 * every event of every known charter, from one cursor per chain. Rows are provisional until FINALITY blocks deep;
 * a provisional row whose block hash is no longer on chain is a reorg and everything provisional from there is
 * read again. Totals are folded from the events themselves, so a reorg that removes an event removes its effect.
 */
export const FINALITY = 15n
const CHUNK = 500n
const MIN_SPLIT = 25n
// Public nodes cap eth_getLogs at 10 addresses per request (publicnode, 9 Nov 2026).
const BATCH = 10

const CHARTER_ABI: Record<CharterKind, Abi> = { loan: loanGuardV2Abi, yield: yieldSweepAbi, grid: gridBandAbi, range: rangeKeeperAbi }
const FACTORY_ABI: Record<CharterKind, Abi> = { loan: loanGuardFactoryV2Abi, yield: yieldSweepFactoryAbi, grid: gridBandFactoryAbi, range: rangeKeeperFactoryAbi }
const baseReads = parseAbi([
  'function expiresAt() view returns (uint64)',
  'function tipToken() view returns (address)',
  'function tipPerAction() view returns (uint256)',
  'function tipBudget() view returns (uint256)',
])
/** The events that are an action, per kind. */
export const ACTION_EVENTS: Record<CharterKind, readonly string[]> = {
  loan: ['Repaid'], yield: ['Supplied', 'Withdrew'], grid: ['Traded'], range: ['Rebalanced', 'Exited'],
}

const rowsOf = <T = Record<string, unknown>>(r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[]
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))
const cursorKey = (chainId: CharterChainId) => `charters-v2:${chainId}:${(V2[chainId].loanFactory ?? 'none').toLowerCase()}`
const KINDS: CharterKind[] = ['loan', 'yield', 'grid', 'range']

export function factories(chainId: CharterChainId): Array<{ kind: CharterKind; address: Address }> {
  return KINDS.flatMap((kind) => { const a = factoryFor(chainId, kind); return a ? [{ kind, address: a }] : [] })
}

async function cursor(chainId: CharterChainId): Promise<bigint> {
  const [row] = rowsOf<{ last_block: string }>(await db().execute(sql`select last_block from chain_cursor where chain_id = ${chainId} and contract = ${cursorKey(chainId)}`))
  if (row) return BigInt(row.last_block)
  const start = V2[chainId].fromBlock
  if (start === null) throw new Error(`no v2 factories on chain ${chainId}`)
  return start - 1n
}

async function unwindIfReorged(client: PublicClient, chainId: CharterChainId): Promise<bigint | null> {
  const provisional = rowsOf<{ block_number: string; block_hash: string }>(await db().execute(sql`
    select distinct block_number, block_hash from charter_v2_event where chain_id = ${chainId} and not final order by block_number`))
  for (const p of provisional) {
    const b = await client.getBlock({ blockNumber: BigInt(p.block_number) }).catch(() => null)
    if (b && b.hash.toLowerCase() === p.block_hash.toLowerCase()) continue
    const from = BigInt(p.block_number)
    await db().transaction(async (tx) => {
      await tx.execute(sql`delete from charter_v2_event where chain_id = ${chainId} and not final and block_number >= ${from}`)
      await tx.execute(sql`delete from charter_v2 where chain_id = ${chainId} and not final and created_block >= ${from}`)
      await tx.execute(sql`update chain_cursor set last_block = ${Number(from - 1n)}, updated_at = now() where chain_id = ${chainId} and contract = ${cursorKey(chainId)}`)
    })
    return from
  }
  return null
}

interface Decoded { kind: CharterKind; event: string; charter: Address; args: Record<string, unknown>; log: Log }

export function decodeLog(log: Log, factoryKinds: Map<string, CharterKind>, charterKinds: Map<string, CharterKind>): Decoded | null {
  const at = log.address.toLowerCase()
  try {
    const fk = factoryKinds.get(at)
    if (fk) {
      const e = decodeEventLog({ abi: FACTORY_ABI[fk], data: log.data, topics: log.topics })
      if (e.eventName !== 'Created') return null
      const args = e.args as unknown as Record<string, unknown>
      return { kind: fk, event: 'Created', charter: getAddress(String(args['charter'])), args, log }
    }
    const ck = charterKinds.get(at)
    if (ck) {
      const e = decodeEventLog({ abi: CHARTER_ABI[ck], data: log.data, topics: log.topics })
      return { kind: ck, event: String(e.eventName), charter: getAddress(log.address), args: e.args as unknown as Record<string, unknown>, log }
    }
  } catch { /* not an event this indexer knows */ }
  return null
}

/** Totals for one charter, folded from its events in chain order. Pure, so it is tested without a database. */
export function fold(kind: CharterKind, events: Array<{ event: string; data: Record<string, string | boolean> }>) {
  const t: Record<string, string | boolean | number> = {}
  let actions = 0
  let tips = 0n
  const executors = new Map<string, boolean>()
  let endedIndex = -1
  const big = (k: string) => BigInt(String(t[k] ?? '0'))
  events.forEach((e, i) => {
    const d = e.data
    if (ACTION_EVENTS[kind].includes(e.event)) actions += 1
    if (e.event === 'TipPaid') tips += BigInt(String(d['amount']))
    if (e.event === 'ExecutorSet') executors.set(String(d['executor']).toLowerCase(), d['allowed'] === true || d['allowed'] === 'true')
    if (e.event === 'Ended' && endedIndex < 0) endedIndex = i
    if (kind === 'loan' && e.event === 'Repaid') t['spent'] = String(d['spentTotal'])
    if (kind === 'yield' && e.event === 'Supplied') { t['grossSupplied'] = String(d['grossSupplied']); t['supplied'] = String(big('supplied') + BigInt(String(d['amount']))) }
    if (kind === 'yield' && e.event === 'Withdrew') { t['withdrawn'] = String(big('withdrawn') + BigInt(String(d['amount']))); t['heldV'] = String(d['heldV']) }
    if (kind === 'grid' && e.event === 'Traded') {
      const buy = d['buy'] === true || d['buy'] === 'true'
      if (buy) { t['quoteSpent'] = String(big('quoteSpent') + BigInt(String(d['amountIn']))); t['buys'] = Number(t['buys'] ?? 0) + 1 }
      else { t['baseSold'] = String(big('baseSold') + BigInt(String(d['amountIn']))); t['sells'] = Number(t['sells'] ?? 0) + 1 }
    }
    if (kind === 'range' && e.event === 'Rebalanced') { t['rebalances'] = Number(t['rebalances'] ?? 0) + 1; t['tokenId'] = String(d['newTokenId']) }
    if (kind === 'range' && e.event === 'Exited') t['exited'] = true
    if (kind === 'range' && e.event === 'Returned') t['returned'] = true
  })
  return { totals: t, actions, tipsPaid: tips.toString(), executors: [...executors].filter(([, on]) => on).map(([a]) => a), endedIndex }
}

/**
 * getLogs that halves its block range when a node refuses a request as too large (public BSC nodes cap the result
 * size, and the charter list only grows). Never skips a block: both halves are always read.
 */
async function logsIn(client: PublicClient, address: Address | Address[], from: bigint, to: bigint): Promise<Log[]> {
  let last: unknown = null
  // A public node under load answers 429 and the fallback lands on a node that refuses getLogs: retry before splitting.
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await client.getLogs({ address, fromBlock: from, toBlock: to }) } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))) }
  }
  {
    const e = last
    const tooBig = /exceeds|limit|too many|range|10000/i.test(e instanceof Error ? e.message : String(e))
    if (!tooBig || to - from < MIN_SPLIT) throw e
    const mid = from + (to - from) / 2n
    return [...await logsIn(client, address, from, mid), ...await logsIn(client, address, mid + 1n, to)]
  }
}

export async function indexOnceV2(client: PublicClient, chainId: CharterChainId): Promise<{ from: bigint; to: bigint; head: bigint; events: number; reorgFrom: bigint | null }> {
  const fs = factories(chainId)
  if (!fs.length) throw new Error(`no v2 factories on chain ${chainId}`)
  const reorgFrom = await unwindIfReorged(client, chainId)
  const head = await client.getBlockNumber()
  const last = await cursor(chainId)
  const from = last + 1n
  if (from > head) return { from, to: last, head, events: 0, reorgFrom }
  const to = head < from + CHUNK - 1n ? head : from + CHUNK - 1n

  const factoryKinds = new Map(fs.map((f) => [f.address.toLowerCase(), f.kind]))
  const charterKinds = new Map(rowsOf<{ address: string; kind: number }>(await db().execute(sql`select address, kind from charter_v2 where chain_id = ${chainId}`))
    .map((r) => [r.address.toLowerCase(), KIND_BY_CODE[r.kind]!] as const))
  const createdLogs = await logsIn(client, fs.map((f) => f.address), from, to)
  const created = createdLogs.map((l) => decodeLog(l, factoryKinds, charterKinds)).filter((d): d is Decoded => d?.event === 'Created')
  for (const c of created) charterKinds.set(c.charter.toLowerCase(), c.kind)
  const addrs = [...charterKinds.keys()] as Address[]
  const logs: Log[] = []
  for (let i = 0; i < addrs.length; i += BATCH) logs.push(...await logsIn(client, addrs.slice(i, i + BATCH), from, to))
  const decoded = [...created, ...logs.map((l) => decodeLog(l, factoryKinds, charterKinds)).filter((d): d is Decoded => d !== null && d.event !== 'Created')]
  decoded.sort((a, b) => Number(a.log.blockNumber! - b.log.blockNumber!) || a.log.logIndex! - b.log.logIndex!)

  const times = new Map<bigint, Date>()
  for (const bn of new Set(decoded.map((d) => d.log.blockNumber!))) times.set(bn, new Date(Number((await client.getBlock({ blockNumber: bn })).timestamp) * 1000))
  // Base facts of new charters, read from the charters themselves (one shape for every kind).
  const base = new Map<string, { expiresAt: bigint; tipToken: string; tipPerAction: bigint; tipBudget: bigint }>()
  for (const c of created) {
    const r = await client.multicall({ allowFailure: false, blockNumber: c.log.blockNumber!, contracts: (['expiresAt', 'tipToken', 'tipPerAction', 'tipBudget'] as const).map((fn) => ({ address: c.charter, abi: baseReads, functionName: fn })) })
    base.set(c.charter.toLowerCase(), { expiresAt: r[0] as bigint, tipToken: String(r[1]), tipPerAction: r[2] as bigint, tipBudget: r[3] as bigint })
  }

  const touched = new Set(decoded.map((d) => d.charter.toLowerCase()))
  await db().transaction(async (tx) => {
    for (const d of decoded) {
      const l = d.log
      const at = times.get(l.blockNumber!) ?? null
      const caller = (d.args['caller'] ?? d.args['by'] ?? d.args['owner'] ?? null) as string | null
      await tx.execute(sql`insert into charter_v2_event (chain_id, address, kind, event, block_number, block_hash, tx_hash, log_index, caller, data, block_time, final)
        values (${chainId}, ${d.charter.toLowerCase()}, ${KIND_CODES[d.kind]}, ${d.event}, ${l.blockNumber!.toString()}, ${l.blockHash!}, ${l.transactionHash!}, ${l.logIndex!},
          ${caller ? caller.toLowerCase() : null}, ${JSON.stringify(json(d.args))}::jsonb, ${at ? at.toISOString() : null}, false)
        on conflict (chain_id, tx_hash, log_index) do nothing`)
      if (d.event === 'Created') {
        const b = base.get(d.charter.toLowerCase())!
        const factory = fs.find((f) => f.kind === d.kind)!.address
        await tx.execute(sql`insert into charter_v2 (chain_id, address, kind, factory, owner, params, tip_token, tip_per_action, tip_budget, expires_at, created_block, created_tx, created_at, final)
          values (${chainId}, ${d.charter.toLowerCase()}, ${KIND_CODES[d.kind]}, ${factory.toLowerCase()}, ${String(d.args['owner']).toLowerCase()}, ${JSON.stringify(json(d.args))}::jsonb,
            ${b.tipToken.toLowerCase()}, ${b.tipPerAction.toString()}, ${b.tipBudget.toString()}, ${new Date(Number(b.expiresAt) * 1000).toISOString()},
            ${l.blockNumber!.toString()}, ${l.transactionHash!}, ${(at ?? new Date()).toISOString()}, false)
          on conflict (chain_id, address) do nothing`)
      }
    }
    for (const a of touched) {
      const kind = charterKinds.get(a)!
      const evs = rowsOf<{ event: string; data: Record<string, string | boolean>; block_time: string | null; tx_hash: string }>(await tx.execute(sql`
        select event, data, block_time, tx_hash from charter_v2_event where chain_id = ${chainId} and address = ${a} order by block_number, log_index`))
      const f = fold(kind, evs)
      const ended = f.endedIndex >= 0 ? evs[f.endedIndex]! : null
      await tx.execute(sql`update charter_v2 set totals = ${JSON.stringify(f.totals)}::jsonb, actions = ${f.actions}, tips_paid = ${f.tipsPaid},
          executors = ${JSON.stringify(f.executors)}::jsonb, ended_at = ${ended?.block_time ?? null}, ended_tx = ${ended?.tx_hash ?? null}
        where chain_id = ${chainId} and address = ${a}`)
    }
    const finalBelow = head >= FINALITY ? head - FINALITY : 0n
    await tx.execute(sql`update charter_v2_event set final = true where chain_id = ${chainId} and not final and block_number <= ${finalBelow.toString()}`)
    await tx.execute(sql`update charter_v2 set final = true where chain_id = ${chainId} and not final and created_block <= ${finalBelow.toString()}`)
    await tx.execute(sql`insert into chain_cursor (chain_id, contract, last_block, updated_at) values (${chainId}, ${cursorKey(chainId)}, ${Number(to)}, now())
      on conflict (chain_id, contract) do update set last_block = excluded.last_block, updated_at = now()`)
  })
  return { from, to, head, events: decoded.length, reorgFrom }
}
