import { sql } from 'drizzle-orm'
import { decodeEventLog, getAddress, type Address, type Log, type PublicClient } from 'viem'
import { db } from '@marque/db'
import { CHARTER_CHAINS, charterFactoryAbi, loanGuardAbi, type CharterChainId } from '@marque/charters'

/**
 * The Charters indexer (derived state, rebuildable from chain). Follows GuardCreated from the factory and Acted,
 * Ended and Swept from every known guard, from a cursor in chain_cursor. Rows are provisional until FINALITY
 * blocks deep; a provisional row whose block hash no longer matches the chain is a reorg: everything provisional
 * from that block is deleted and read again.
 */
export const FINALITY = 15n
const CHUNK = 2_000n
const GUARD_BATCH = 100

const rowsOf = <T = Record<string, unknown>>(r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[]
const cursorKey = (chainId: number) => `charters:${chainId}`

async function cursor(chainId: CharterChainId): Promise<bigint> {
  const [row] = rowsOf<{ last_block: string }>(await db().execute(sql`select last_block from chain_cursor where chain_id = ${chainId} and contract = ${cursorKey(chainId)}`))
  if (row) return BigInt(row.last_block)
  const start = CHARTER_CHAINS[chainId].factoryBlock
  if (start === null) throw new Error(`no factory on chain ${chainId}`)
  return start - 1n
}

async function setCursor(chainId: CharterChainId, block: bigint) {
  await db().execute(sql`insert into chain_cursor (chain_id, contract, last_block, updated_at) values (${chainId}, ${cursorKey(chainId)}, ${Number(block)}, now())
    on conflict (chain_id, contract) do update set last_block = excluded.last_block, updated_at = now()`)
}

/** Reorg check: the newest provisional event's block hash must still be on chain; if not, unwind from there. */
async function unwindIfReorged(client: PublicClient, chainId: CharterChainId): Promise<bigint | null> {
  const provisional = rowsOf<{ block_number: string; block_hash: string }>(await db().execute(sql`
    select distinct block_number, block_hash from charter_guard_event where chain_id = ${chainId} and not final order by block_number`))
  for (const p of provisional) {
    const b = await client.getBlock({ blockNumber: BigInt(p.block_number) }).catch(() => null)
    if (b && b.hash.toLowerCase() === p.block_hash.toLowerCase()) continue
    const from = BigInt(p.block_number)
    await db().transaction(async (tx) => {
      await tx.execute(sql`delete from charter_guard_event where chain_id = ${chainId} and not final and block_number >= ${from}`)
      await tx.execute(sql`delete from charter_guard where chain_id = ${chainId} and not final and created_block >= ${from}`)
      await tx.execute(sql`update chain_cursor set last_block = ${Number(from - 1n)}, updated_at = now() where chain_id = ${chainId} and contract = ${cursorKey(chainId)}`)
    })
    return from
  }
  return null
}

interface Decoded { kind: 'GuardCreated' | 'Acted' | 'Ended' | 'Swept'; args: Record<string, unknown>; log: Log }

function decode(log: Log, factory: Address): Decoded | null {
  try {
    if (log.address.toLowerCase() === factory.toLowerCase()) {
      const e = decodeEventLog({ abi: charterFactoryAbi, data: log.data, topics: log.topics })
      return e.eventName === 'GuardCreated' ? { kind: 'GuardCreated', args: e.args as Record<string, unknown>, log } : null
    }
    const e = decodeEventLog({ abi: loanGuardAbi, data: log.data, topics: log.topics })
    if (e.eventName === 'Acted' || e.eventName === 'Ended' || e.eventName === 'Swept') return { kind: e.eventName, args: e.args as Record<string, unknown>, log }
  } catch { /* not ours */ }
  return null
}

const json = (args: Record<string, unknown>) => JSON.parse(JSON.stringify(args, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))

/** One indexing pass. Returns how far it got and what it found. */
export async function indexOnce(client: PublicClient, chainId: CharterChainId): Promise<{ from: bigint; to: bigint; head: bigint; events: number; reorgFrom: bigint | null }> {
  const chain = CHARTER_CHAINS[chainId]
  if (!chain.factory) throw new Error(`no factory on chain ${chainId}`)
  const factory = chain.factory
  const reorgFrom = await unwindIfReorged(client, chainId)
  const head = await client.getBlockNumber()
  const last = await cursor(chainId)
  const from = last + 1n
  if (from > head) return { from, to: last, head, events: 0, reorgFrom }
  const to = head < from + CHUNK - 1n ? head : from + CHUNK - 1n

  // Guards known before this range, plus any created inside it (their own events can share the range).
  const known = rowsOf<{ address: string }>(await db().execute(sql`select address from charter_guard where chain_id = ${chainId}`)).map((r) => getAddress(r.address))
  const created = await client.getLogs({ address: factory, fromBlock: from, toBlock: to })
  const decodedCreated = created.map((l) => decode(l, factory)).filter((d): d is Decoded => d?.kind === 'GuardCreated')
  const guards = [...new Set([...known, ...decodedCreated.map((d) => getAddress(String(d.args['guard'])))])]
  const guardLogs: Log[] = []
  for (let i = 0; i < guards.length; i += GUARD_BATCH) {
    guardLogs.push(...await client.getLogs({ address: guards.slice(i, i + GUARD_BATCH), fromBlock: from, toBlock: to }))
  }
  const decoded = [...decodedCreated, ...guardLogs.map((l) => decode(l, factory)).filter((d): d is Decoded => d !== null && d.kind !== 'GuardCreated')]
  const times = new Map<bigint, Date>()
  for (const bn of new Set(decoded.map((d) => d.log.blockNumber!))) {
    const b = await client.getBlock({ blockNumber: bn })
    times.set(bn, new Date(Number(b.timestamp) * 1000))
  }

  await db().transaction(async (tx) => {
    for (const d of decoded) {
      const l = d.log
      const address = d.kind === 'GuardCreated' ? getAddress(String(d.args['guard'])) : getAddress(l.address)
      const caller = d.kind === 'Acted' ? String(d.args['caller']).toLowerCase() : d.kind === 'Ended' ? String(d.args['by']).toLowerCase() : d.kind === 'GuardCreated' ? String(d.args['owner']).toLowerCase() : null
      const at = times.get(l.blockNumber!) ?? null
      await tx.execute(sql`insert into charter_guard_event (chain_id, address, kind, block_number, block_hash, tx_hash, log_index, caller, data, block_time, final)
        values (${chainId}, ${address.toLowerCase()}, ${d.kind}, ${l.blockNumber!.toString()}, ${l.blockHash!}, ${l.transactionHash!}, ${l.logIndex!}, ${caller}, ${JSON.stringify(json(d.args))}::jsonb, ${at}, false)
        on conflict (chain_id, tx_hash, log_index) do nothing`)
      if (d.kind === 'GuardCreated') {
        const a = d.args as { owner: string; vDebt: string; token: string; trigger: bigint; target: bigint; budget: bigint; tip: bigint; expiresAt: bigint }
        await tx.execute(sql`insert into charter_guard (chain_id, address, owner, v_debt, token, trigger, target, budget, tip, expires_at, created_block, created_tx, created_at, final)
          values (${chainId}, ${address.toLowerCase()}, ${a.owner.toLowerCase()}, ${a.vDebt.toLowerCase()}, ${a.token.toLowerCase()}, ${a.trigger.toString()}, ${a.target.toString()},
            ${a.budget.toString()}, ${a.tip.toString()}, ${new Date(Number(a.expiresAt) * 1000)}, ${l.blockNumber!.toString()}, ${l.transactionHash!}, ${at ?? new Date()}, false)
          on conflict (chain_id, address) do nothing`)
      }
    }
    // Totals come from the events themselves, so a reorg that removed an event also removes its effect.
    await tx.execute(sql`update charter_guard g set
        spent = coalesce((select max((e.data->>'spentTotal')::numeric) from charter_guard_event e where e.chain_id = g.chain_id and e.address = g.address and e.kind = 'Acted'), 0),
        acts = (select count(*) from charter_guard_event e where e.chain_id = g.chain_id and e.address = g.address and e.kind = 'Acted'),
        ended_at = (select min(e.block_time) from charter_guard_event e where e.chain_id = g.chain_id and e.address = g.address and e.kind = 'Ended'),
        ended_tx = (select e.tx_hash from charter_guard_event e where e.chain_id = g.chain_id and e.address = g.address and e.kind = 'Ended' order by e.block_number limit 1)
      where g.chain_id = ${chainId}`)
    const finalBelow = head >= FINALITY ? head - FINALITY : 0n
    await tx.execute(sql`update charter_guard_event set final = true where chain_id = ${chainId} and not final and block_number <= ${finalBelow.toString()}`)
    await tx.execute(sql`update charter_guard set final = true where chain_id = ${chainId} and not final and created_block <= ${finalBelow.toString()}`)
  })
  await setCursor(chainId, to)
  return { from, to, head, events: decoded.length, reorgFrom }
}
