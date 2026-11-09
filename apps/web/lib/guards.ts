import 'server-only'
import { sql } from 'drizzle-orm'
import { erc20Abi, getAddress, parseAbi, type Address } from 'viem'
import { chartersDb } from '@marque/db'
import { chainClient } from '@marque/commerce'
import {
  BACKUP_WATCHER, CHARTER_CHAINS, DECLARED_EXECUTORS, HEALTH_ONE, KEEL_WATCHER, marketOf, readLoan, readPreview, readReserve,
  dropToHealth, priceAtHealth, priceToUsd, repayAtTrigger, smartDefaults, callerKind,
  type CharterChainId, type GuardSummary, type LivePreview,
} from '@marque/charters'

/**
 * Every Charters read for the site, the API and the MCP tools. Guards and events come from the index (derived,
 * rebuildable from chain); anything that must be current is read live with its block and time. A live read that
 * fails says so; it never falls back to an older number presented as current.
 */
const rowsOf = <T = Record<string, unknown>>(r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[]
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString())
const s = (v: unknown) => (v === null || v === undefined ? null : String(v))

type GuardRow = {
  chain_id: number; address: string; owner: string; v_debt: string; token: string; trigger: string; target: string; budget: string; tip: string
  spent: string; acts: number; expires_at: string; created_at: string; created_tx: string; ended_at: string | null; final: boolean
  sample_state: number | null; sample_health: string | null; sample_read_at: string | null; sample_block: string | null
}

function toSummary(r: GuardRow): GuardSummary {
  const chainId = r.chain_id as CharterChainId
  const m = marketOf(chainId, r.v_debt)
  const ended = r.ended_at !== null
  const expired = !ended && new Date(r.expires_at).getTime() <= Date.now()
  return {
    chainId, address: getAddress(r.address), owner: getAddress(r.owner), vDebt: getAddress(r.v_debt), token: getAddress(r.token),
    symbol: m?.symbol ?? 'token', decimals: m?.decimals ?? 18,
    trigger: String(r.trigger), target: String(r.target), budget: String(r.budget), tip: String(r.tip), spent: String(r.spent), acts: Number(r.acts),
    expiresAt: iso(r.expires_at)!, createdAt: iso(r.created_at)!, createdTx: r.created_tx, endedAt: iso(r.ended_at),
    status: ended ? 'ended' : expired ? 'expired' : 'armed', final: Boolean(r.final),
    lastSample: r.sample_read_at ? { state: Number(r.sample_state), health: s(r.sample_health), readAt: iso(r.sample_read_at)!, blockNumber: String(r.sample_block) } : null,
  }
}

const SELECT = sql`select g.*, ls.state as sample_state, ls.health as sample_health, ls.read_at as sample_read_at, ls.block_number as sample_block
  from charter_guard g
  left join lateral (select state, health, read_at, block_number from charter_guard_sample x where x.chain_id = g.chain_id and x.address = g.address order by read_at desc limit 1) ls on true`

export async function listGuards(q: { chainId?: CharterChainId; owner?: string; state: 'armed' | 'ended' | 'all'; cursor?: string; limit: number }) {
  const where = [sql`true`]
  if (q.chainId) where.push(sql`g.chain_id = ${q.chainId}`)
  if (q.owner) where.push(sql`g.owner = ${q.owner.toLowerCase()}`)
  if (q.state === 'armed') where.push(sql`g.ended_at is null and g.expires_at > now()`)
  if (q.state === 'ended') where.push(sql`(g.ended_at is not null or g.expires_at <= now())`)
  if (q.cursor) where.push(sql`g.created_block < ${q.cursor}`)
  const rows = rowsOf<GuardRow & { created_block: string }>(await chartersDb().execute(sql`${SELECT} where ${sql.join(where, sql` and `)} order by g.created_block desc limit ${q.limit + 1}`))
  const page = rows.slice(0, q.limit)
  return { guards: page.map(toSummary), nextCursor: rows.length > q.limit ? String(page.at(-1)!.created_block) : null, readAt: new Date().toISOString() }
}

const factoryAbi = parseAbi(['function isGuard(address) view returns (bool)'])

/** A guard's whole record: the index row, every event, Keel's key, the health history and a live read. */
export async function guardDetail(chainId: CharterChainId, address: string) {
  const a = address.toLowerCase()
  const [row] = rowsOf<GuardRow>(await chartersDb().execute(sql`${SELECT} where g.chain_id = ${chainId} and g.address = ${a}`))
  if (!row) return null
  const guard = toSummary(row)
  const [events, keyRows, samples] = await Promise.all([
    chartersDb().execute(sql`select kind, block_number, tx_hash, log_index, caller, data, block_time, final from charter_guard_event
      where chain_id = ${chainId} and address = ${a} order by block_number, log_index`).then(rowsOf<Record<string, unknown>>),
    chartersDb().execute(sql`select wallet_address, key_id, expiry, grant_tx, revoke_tx, registered, status, last_checked_at from charter_watch_key where chain_id = ${chainId} and guard = ${a}`).then(rowsOf<Record<string, unknown>>),
    // Thirty days, at most about 300 points: one per bucket, the newest in each.
    chartersDb().execute(sql`select distinct on (bucket) bucket, state, health, read_at, block_number from (
        select state, health, read_at, block_number,
          floor(extract(epoch from read_at) / greatest(1, (extract(epoch from now()) - extract(epoch from now() - interval '30 days')) / 300)) as bucket
        from charter_guard_sample where chain_id = ${chainId} and address = ${a} and read_at > now() - interval '30 days') t
      order by bucket, read_at desc`).then(rowsOf<Record<string, unknown>>),
  ])
  const client = chainClient(chainId)
  const readAt = new Date().toISOString()
  let live: LivePreview
  try {
    const block = await client.getBlockNumber()
    const p = await readPreview(client, guard.address as Address, block)
    const unread = p.state === 'ended' || p.state === 'expired'
    live = { state: p.state, health: unread || p.health === (1n << 256n) - 1n ? null : p.health.toString(), wouldRepay: p.wouldRepay.toString(), available: p.available.toString(), debt: unread ? '0' : p.debt.toString(), blockNumber: block.toString(), readAt, fromChain: true, unavailableReason: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    live = { state: 'unavailable', health: null, wouldRepay: '0', available: '0', debt: '0', blockNumber: null, readAt, fromChain: true,
      unavailableReason: /PriceUnavailable|price/i.test(msg) ? 'price' : 'read' }
  }
  const [reserve, isGuard] = await Promise.all([
    readReserve(client, guard.token as Address, guard.owner as Address, guard.address as Address).catch(() => null),
    client.readContract({ address: CHARTER_CHAINS[chainId].factory!, abi: factoryAbi, functionName: 'isGuard', args: [guard.address as Address] }).catch(() => null),
  ])
  const key = keyRows[0] ?? null
  return {
    guard, live,
    reserve: reserve ? { balance: reserve.balance.toString(), allowance: reserve.allowance.toString() } : null,
    madeByFactory: isGuard,
    factory: CHARTER_CHAINS[chainId].factory,
    events: events.map((e) => ({
      kind: String(e['kind']), blockNumber: String(e['block_number']), txHash: String(e['tx_hash']), logIndex: Number(e['log_index']),
      caller: s(e['caller']), callerKind: e['caller'] ? callerKind(String(e['caller']), guard.owner) : null,
      data: e['data'] as Record<string, string>, at: iso(e['block_time']), final: Boolean(e['final']),
    })),
    keel: key ? {
      wallet: getAddress(String(key['wallet_address'])), keyId: s(key['key_id']), expiry: iso(key['expiry']), grantTx: s(key['grant_tx']), revokeTx: s(key['revoke_tx']),
      registered: Boolean(key['registered']), status: String(key['status']), checkedAt: iso(key['last_checked_at']),
    } : null,
    history: samples.map((x) => ({ state: Number(x['state']), health: s(x['health']), at: iso(x['read_at'])!, blockNumber: String(x['block_number']) })),
    readAt,
  }
}

/** Live counts per chain, each with its read time. */
export async function guardStats() {
  const rows = rowsOf<Record<string, unknown>>(await chartersDb().execute(sql`
    select g.chain_id,
      count(*) filter (where g.ended_at is null and g.expires_at > now())::int as armed,
      count(*)::int as created,
      coalesce(sum(g.acts), 0)::int as acts,
      (select max(e.block_time) from charter_guard_event e where e.chain_id = g.chain_id and e.kind = 'Acted') as last_action
    from charter_guard g group by g.chain_id`))
  const repaid = rowsOf<Record<string, unknown>>(await chartersDb().execute(sql`
    select e.chain_id, g.token, sum((e.data->>'repaid')::numeric) as repaid from charter_guard_event e
    join charter_guard g on g.chain_id = e.chain_id and g.address = e.address where e.kind = 'Acted' group by e.chain_id, g.token`))
  const readAt = new Date().toISOString()
  return {
    chains: ([56, 97] as const).map((chainId) => {
      const r = rows.find((x) => Number(x['chain_id']) === chainId)
      return {
        chainId, deployed: CHARTER_CHAINS[chainId].factory !== null,
        armed: Number(r?.['armed'] ?? 0), created: Number(r?.['created'] ?? 0), acts: Number(r?.['acts'] ?? 0),
        lastAction: iso(r?.['last_action']),
        repaid: repaid.filter((x) => Number(x['chain_id']) === chainId).map((x) => {
          const m = CHARTER_CHAINS[chainId].markets.find((k) => k.token.toLowerCase() === String(x['token']))
          return { token: getAddress(String(x['token'])), symbol: m?.symbol ?? 'token', decimals: m?.decimals ?? 18, amount: String(x['repaid']).split('.')[0]! }
        }),
      }
    }),
    readAt,
  }
}

/**
 * What the builder needs for an address: Venus's health, the loan's markets with what a guard can and cannot repay,
 * price framing for the trigger and target, a starting point, and the reserve the owner holds.
 */
export async function guardQuote(q: { chainId: CharterChainId; account: string; market?: string; trigger?: string; target?: string }) {
  const client = chainClient(q.chainId)
  const account = getAddress(q.account)
  const loan = await readLoan(client, q.chainId, account)
  const borrowed = loan.markets.filter((m) => m.borrowed > 0n)
  const supported = borrowed.filter((m) => m.repayable).sort((x, y) => (y.borrowedUsd > x.borrowedUsd ? 1 : -1))
  const chosen = q.market ? supported.find((m) => m.vToken.toLowerCase() === q.market!.toLowerCase()) ?? null : supported[0] ?? null
  const main = loan.mainCollateral
  const framing = main ? { collateralUsd: loan.collateralUsd, debtUsd: loan.debtUsd, main } : null
  const parseH = (v: string | undefined) => (v ? BigInt(Math.round(Number(v) * 100)) * 10n ** 16n : null)
  const defaults = framing && loan.debtUsd > 0n ? smartDefaults(framing, loan.health) : null
  const trigger = parseH(q.trigger) ?? defaults?.trigger ?? null
  const target = parseH(q.target) ?? defaults?.target ?? null
  const market = chosen ? CHARTER_CHAINS[q.chainId].markets.find((m) => m.vToken.toLowerCase() === chosen.vToken.toLowerCase()) ?? null : null
  // The wallet's balance of the debt token, whether or not a factory exists on this chain yet.
  const balance = market ? await client.readContract({ address: market.token as Address, abi: erc20Abi, functionName: 'balanceOf', args: [account] }).catch(() => null) : null
  const priceOf = (h: bigint | null) => (framing && h !== null ? priceAtHealth(framing, h) : null)
  const usd = (p: bigint | null) => (p !== null && main ? priceToUsd(p, main.decimals) : null)
  return {
    chainId: q.chainId, account, blockNumber: loan.blockNumber.toString(), readAt: loan.readAt,
    health: loan.debtUsd === 0n ? null : loan.health.toString(),
    collateralUsd: loan.collateralUsd.toString(), debtUsd: loan.debtUsd.toString(), vaiDebtUsd: loan.vaiDebtUsd.toString(),
    markets: loan.markets.map((m) => ({
      vToken: m.vToken, symbol: m.symbol, decimals: m.decimals, price: m.price.toString(), priceUsd: priceToUsd(m.price, m.decimals),
      supplied: m.supplied.toString(), borrowed: m.borrowed.toString(), liquidationThreshold: m.liquidationThreshold.toString(),
      weightedUsd: m.weightedUsd.toString(), borrowedUsd: m.borrowedUsd.toString(), repayable: m.repayable, unsupportedReason: m.unsupportedReason,
    })),
    mainCollateral: main ? { vToken: main.vToken, symbol: main.symbol, decimals: main.decimals, price: main.price.toString(), priceUsd: priceToUsd(main.price, main.decimals),
      supplied: main.supplied.toString(), liquidationThreshold: main.liquidationThreshold.toString() } : null,
    market: chosen && market ? { vToken: chosen.vToken, token: market.token, symbol: market.symbol, decimals: market.decimals, price: chosen.price.toString(), borrowed: chosen.borrowed.toString() } : null,
    noLoan: loan.debtUsd === 0n,
    unsupportedOnly: borrowed.length > 0 && supported.length === 0,
    defaults: defaults ? { trigger: defaults.trigger.toString(), target: defaults.target.toString(), warn: defaults.warn } : null,
    framing: trigger !== null && target !== null && framing ? {
      trigger: trigger.toString(), target: target.toString(),
      triggerPriceUsd: usd(priceOf(trigger)), targetPriceUsd: usd(priceOf(target)), liquidationPriceUsd: usd(priceOf(HEALTH_ONE)),
      dropToTriggerPct: dropToHealth(framing, trigger), dropToLiquidationPct: dropToHealth(framing, HEALTH_ONE),
      repayAtTrigger: chosen ? repayAtTrigger(framing, trigger, target, chosen.price).toString() : null,
      actsNow: trigger > loan.health,
    } : null,
    wallet: balance !== null && market ? { balance: balance.toString(), symbol: market.symbol, decimals: market.decimals } : null,
  }
}

/** What an agent's declared executors have done across every guard, from Acted events (ONCHAIN). */
export async function agentActs(agentId: string) {
  const executors = (DECLARED_EXECUTORS[agentId.toLowerCase()] ?? []).map((x) => x.toLowerCase())
  if (!executors.length) return { agentId, executors: [], chains: [] as Array<{ chainId: number; guards: number; acts: number; lastAction: string | null }> }
  const rows = rowsOf<Record<string, unknown>>(await chartersDb().execute(sql`
    select chain_id, count(distinct address)::int as guards, count(*)::int as acts, max(block_time) as last_action
    from charter_guard_event where kind = 'Acted' and caller in (${sql.join(executors.map((x) => sql`${x}`), sql`, `)}) group by chain_id`))
  return {
    agentId, executors: executors.map((x) => getAddress(x)),
    chains: rows.map((r) => ({ chainId: Number(r['chain_id']), guards: Number(r['guards']), acts: Number(r['acts']), lastAction: iso(r['last_action']) })),
  }
}

export const WATCHERS = { keel: KEEL_WATCHER as Address, backup: BACKUP_WATCHER as Address }
