import 'server-only'
import { sql } from 'drizzle-orm'
import { erc20Abi, getAddress, parseAbi, type Abi, type Address } from 'viem'
import { chartersDb } from '@marque/db'
import { chainClient } from '@marque/commerce'
import {
  V2, KIND_CODES, KIND_BY_CODE, KIND_NAMES, EXECUTORS, OPEN_KINDS, CHARTER_CHAINS, stateName, factoryFor,
  loanGuardV2Abi, yieldSweepAbi, gridBandAbi, rangeKeeperAbi, gridBandFactoryAbi, yieldSweepFactoryAbi,
  type CharterChainId, type CharterKind,
} from '@marque/charters'

/**
 * Charters v2 reads for the site, the API and the MCP tools (four kinds). Charters and events come from the index
 * (derived, rebuildable from chain); anything that must be current is read live with its block and read time, and a
 * live read that fails says so instead of falling back to an older number. Testnet grid and range charters sit on
 * Marque's labelled fixture pool, and every response that carries one says `fixture: true` (C11).
 */
const rowsOf = <T = Record<string, unknown>>(r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[]
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString())
const str = (v: unknown): unknown => (typeof v === 'bigint' ? v.toString() : Array.isArray(v) ? v.map(str) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, str(x)])) : v)
export const ABI_BY_KIND: Record<CharterKind, Abi> = { loan: loanGuardV2Abi, yield: yieldSweepAbi, grid: gridBandAbi, range: rangeKeeperAbi }
const PREVIEW_FIELDS: Record<CharterKind, string[]> = {
  loan: ['state', 'health', 'wouldRepay', 'available', 'debt'],
  yield: ['state', 'amount', 'walletBalance', 'heldUnderlying'],
  grid: ['state', 'slot', 'buy', 'amountIn', 'twapTick', 'spotTick'],
  range: ['state', 'twapTick', 'spotTick', 'lower', 'upper'],
}

type Row = {
  chain_id: number; address: string; kind: number; factory: string; owner: string; params: Record<string, unknown>; executors: string[]
  tip_token: string | null; tip_per_action: string; tip_budget: string; tips_paid: string; totals: Record<string, unknown>; actions: number
  expires_at: string; created_block: string; created_tx: string; created_at: string; ended_at: string | null; ended_tx: string | null; final: boolean
  s_state: number | null; s_data: Record<string, unknown> | null; s_read_at: string | null
}

export function poolOf(chainId: CharterChainId, pool: string) {
  return V2[chainId].pools.find((p) => p.address.toLowerCase() === pool.toLowerCase()) ?? null
}

export function summarize(r: Row) {
  const chainId = r.chain_id as CharterChainId
  const kind = KIND_BY_CODE[r.kind]!
  const params = r.params as { params?: { p?: Record<string, unknown> } & Record<string, unknown> }
  const p = (params.params?.p ?? {}) as Record<string, unknown>
  const pool = typeof p['pool'] === 'string' ? poolOf(chainId, p['pool']) : null
  const ended = r.ended_at !== null
  const expired = !ended && new Date(r.expires_at).getTime() <= Date.now()
  return {
    chainId, address: getAddress(r.address), kind, kindName: KIND_NAMES[kind], version: 2 as const, open: OPEN_KINDS.has(kind),
    owner: getAddress(r.owner), factory: getAddress(r.factory), params: str(params.params ?? {}) as Record<string, unknown>,
    executors: r.executors.map((e) => getAddress(e)), tipToken: r.tip_token ? getAddress(r.tip_token) : null,
    tipPerAction: String(r.tip_per_action), tipBudget: String(r.tip_budget), tipsPaid: String(r.tips_paid),
    totals: r.totals, actions: Number(r.actions), expiresAt: iso(r.expires_at)!, createdAt: iso(r.created_at)!, createdTx: r.created_tx,
    endedAt: iso(r.ended_at), endedTx: r.ended_tx, status: ended ? 'ended' as const : expired ? 'expired' as const : 'armed' as const, final: Boolean(r.final),
    fixture: pool?.fixture ?? false, pool: pool ? { ...pool } : null,
    lastSample: r.s_read_at ? { state: Number(r.s_state), stateName: stateName(kind, Number(r.s_state)), data: r.s_data, readAt: iso(r.s_read_at)! } : null,
  }
}
export type CharterV2Summary = ReturnType<typeof summarize>

const SELECT = sql`select c.*, ls.state as s_state, ls.data as s_data, ls.read_at as s_read_at from charter_v2 c
  left join lateral (select state, data, read_at from charter_v2_sample x where x.chain_id = c.chain_id and x.address = c.address order by read_at desc limit 1) ls on true`

export async function listChartersV2(q: { chainId?: CharterChainId; owner?: string; kind?: CharterKind; state: 'armed' | 'ended' | 'all'; cursor?: string; limit: number }) {
  const where = [sql`true`]
  if (q.chainId) where.push(sql`c.chain_id = ${q.chainId}`)
  if (q.owner) where.push(sql`c.owner = ${q.owner.toLowerCase()}`)
  if (q.kind) where.push(sql`c.kind = ${KIND_CODES[q.kind]}`)
  if (q.state === 'armed') where.push(sql`c.ended_at is null and c.expires_at > now()`)
  if (q.state === 'ended') where.push(sql`(c.ended_at is not null or c.expires_at <= now())`)
  if (q.cursor) where.push(sql`c.created_block < ${q.cursor}`)
  const rows = rowsOf<Row>(await chartersDb().execute(sql`${SELECT} where ${sql.join(where, sql` and `)} order by c.created_block desc limit ${q.limit + 1}`))
  const page = rows.slice(0, q.limit)
  return { charters: page.map(summarize), nextCursor: rows.length > q.limit ? String(page.at(-1)!.created_block) : null, readAt: new Date().toISOString() }
}

/** One live preview, decoded into named fields, with its block and read time. */
export async function livePreview(chainId: CharterChainId, kind: CharterKind, address: Address) {
  const readAt = new Date().toISOString()
  try {
    const client = chainClient(chainId)
    const block = await client.getBlockNumber()
    const r = await client.readContract({ address, abi: ABI_BY_KIND[kind], functionName: 'preview', blockNumber: block }) as readonly unknown[]
    const fields = Object.fromEntries(PREVIEW_FIELDS[kind].map((n, i) => [n, str(r[i])]))
    const code = Number(r[0])
    return { ok: true as const, state: stateName(kind, code), stateCode: code, fields, blockNumber: block.toString(), readAt, fromChain: true as const }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false as const, state: 'unavailable', reason: /OLD|observ/i.test(msg) ? 'pool_history' : /price/i.test(msg) ? 'price' : 'read', readAt, fromChain: true as const }
  }
}

export async function charterV2Detail(chainId: CharterChainId, address: string) {
  const a = address.toLowerCase()
  const [row] = rowsOf<Row>(await chartersDb().execute(sql`${SELECT} where c.chain_id = ${chainId} and c.address = ${a}`))
  if (!row) return null
  const charter = summarize(row)
  const [events, keys, samples] = await Promise.all([
    chartersDb().execute(sql`select event, block_number, tx_hash, log_index, caller, data, block_time, final from charter_v2_event
      where chain_id = ${chainId} and address = ${a} order by block_number, log_index`).then(rowsOf<Record<string, unknown>>),
    chartersDb().execute(sql`select wallet_address, agent, key_id, expiry, grant_tx, revoke_tx, registered, status, error, last_checked_at from charter_watch_key where chain_id = ${chainId} and guard = ${a}`).then(rowsOf<Record<string, unknown>>),
    chartersDb().execute(sql`select distinct on (bucket) bucket, state, data, read_at from (
        select state, data, read_at, floor(extract(epoch from read_at) / 8640) as bucket
        from charter_v2_sample where chain_id = ${chainId} and address = ${a} and read_at > now() - interval '30 days') t
      order by bucket, read_at desc`).then(rowsOf<Record<string, unknown>>),
  ])
  const live = await livePreview(chainId, charter.kind, charter.address)
  const key = keys[0] ?? null
  const agentOf = (addr: string | null) => {
    if (!addr) return null
    const hit = (Object.entries(EXECUTORS) as Array<[string, string]>).find(([, x]) => x.toLowerCase() === addr.toLowerCase())
    return hit ? hit[0] : addr.toLowerCase() === charter.owner.toLowerCase() ? 'owner' : 'other'
  }
  return {
    charter, live,
    events: events.map((e) => ({ event: String(e['event']), blockNumber: String(e['block_number']), txHash: String(e['tx_hash']), logIndex: Number(e['log_index']),
      caller: e['caller'] ? getAddress(String(e['caller'])) : null, callerIs: agentOf(e['caller'] ? String(e['caller']) : null),
      data: e['data'] as Record<string, unknown>, at: iso(e['block_time']), final: Boolean(e['final']) })),
    key: key ? { agent: String(key['agent']), wallet: key['wallet_address'] ? getAddress(String(key['wallet_address'])) : null, keyId: key['key_id'] ? String(key['key_id']) : null,
      expiry: iso(key['expiry']), grantTx: key['grant_tx'] ? String(key['grant_tx']) : null, revokeTx: key['revoke_tx'] ? String(key['revoke_tx']) : null,
      registered: Boolean(key['registered']), status: String(key['status']), note: key['error'] ? String(key['error']) : null, checkedAt: iso(key['last_checked_at']) } : null,
    history: samples.map((x) => ({ state: Number(x['state']), data: x['data'] as Record<string, unknown>, at: iso(x['read_at'])! })),
    readAt: new Date().toISOString(),
  }
}

/** Counts per chain and kind, with the read time. Zero is an honest zero. */
export async function chartersV2Stats() {
  const rows = rowsOf<{ chain_id: number; kind: number; armed: number; created: number; actions: number; last_action: string | null }>(await chartersDb().execute(sql`
    select c.chain_id, c.kind, count(*) filter (where c.ended_at is null and c.expires_at > now())::int as armed, count(*)::int as created,
      coalesce(sum(c.actions), 0)::int as actions,
      (select max(e.block_time) from charter_v2_event e where e.chain_id = c.chain_id and e.kind = c.kind and e.event in ('Repaid','Supplied','Withdrew','Traded','Rebalanced','Exited')) as last_action
    from charter_v2 c group by c.chain_id, c.kind`))
  const kinds: CharterKind[] = ['loan', 'yield', 'grid', 'range']
  return {
    chains: ([56, 97] as const).map((chainId) => ({
      chainId,
      kinds: kinds.map((kind) => {
        const r = rows.find((x) => x.chain_id === chainId && x.kind === KIND_CODES[kind])
        return { kind, deployed: factoryFor(chainId, kind) !== null, armed: r?.armed ?? 0, created: r?.created ?? 0, actions: r?.actions ?? 0, lastAction: iso(r?.last_action ?? null) }
      }),
    })),
    readAt: new Date().toISOString(),
  }
}

/** Actions by an agent's declared executor address, per chain and kind (chain-counted, C8 "executed"). */
export async function executedBy(executor: string) {
  const rows = rowsOf<{ chain_id: number; kind: number; actions: number; charters: number; last: string | null }>(await chartersDb().execute(sql`
    select chain_id, kind, count(*)::int as actions, count(distinct address)::int as charters, max(block_time) as last from charter_v2_event
    where caller = ${executor.toLowerCase()} and event in ('Repaid','Supplied','Withdrew','Traded','Rebalanced','Exited') group by chain_id, kind`))
  return rows.map((r) => ({ chainId: r.chain_id as CharterChainId, kind: KIND_BY_CODE[r.kind]!, actions: r.actions, charters: r.charters, lastAction: iso(r.last) }))
}

const venusReads = parseAbi([
  'function checkMembership(address account, address vToken) view returns (bool)',
  'function supplyCaps(address) view returns (uint256)',
  'function getCash() view returns (uint256)',
  'function exchangeRateStored() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function borrowBalanceStored(address) view returns (uint256)',
])
const poolReads = parseAbi([
  'function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint32, bool)',
  'function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)',
  'function tickSpacing() view returns (int24)',
])
const npmReads = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
  'function positions(uint256) view returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)',
])

async function twapTick(chainId: CharterChainId, pool: Address, window: number): Promise<number | null> {
  try {
    const [cum] = await chainClient(chainId).readContract({ address: pool, abi: poolReads, functionName: 'observe', args: [[window, 0]] })
    return Math.floor(Number(cum[1]! - cum[0]!) / window)
  } catch { return null }
}

/** What a builder needs for an address and a kind: every number read live, with its block and read time. */
export async function quoteV2(kind: Exclude<CharterKind, 'loan'>, chainId: CharterChainId, account: Address) {
  const client = chainClient(chainId)
  const block = await client.getBlockNumber()
  const readAt = new Date().toISOString()
  if (kind === 'yield') {
    const comptroller = CHARTER_CHAINS[chainId].comptroller
    const markets = await Promise.all(CHARTER_CHAINS[chainId].markets.map(async (m) => {
      const [balance, member, cap, cash, rate, totalV, debt] = await Promise.all([
        client.readContract({ address: m.token, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber: block }),
        client.readContract({ address: comptroller, abi: venusReads, functionName: 'checkMembership', args: [account, m.vToken], blockNumber: block }),
        client.readContract({ address: comptroller, abi: venusReads, functionName: 'supplyCaps', args: [m.vToken], blockNumber: block }),
        client.readContract({ address: m.vToken, abi: venusReads, functionName: 'getCash', blockNumber: block }),
        client.readContract({ address: m.vToken, abi: venusReads, functionName: 'exchangeRateStored', blockNumber: block }),
        client.readContract({ address: m.vToken, abi: venusReads, functionName: 'totalSupply', blockNumber: block }),
        client.readContract({ address: m.vToken, abi: venusReads, functionName: 'borrowBalanceStored', args: [account], blockNumber: block }),
      ])
      const supplied = totalV * rate / 10n ** 18n
      return {
        ...m, balance: balance.toString(), collateralMember: member, borrows: debt > 0n, cash: cash.toString(), exchangeRate: rate.toString(),
        supplyCapRoom: cap === 0n ? '0' : cap <= supplied ? '0' : (cap - supplied).toString(), unlimitedCap: cap === (1n << 256n) - 1n,
      }
    }))
    return { kind, chainId, account, factory: V2[chainId].yieldFactory, markets, blockNumber: block.toString(), readAt, fromChain: true as const }
  }
  if (kind === 'grid') {
    const pools = await Promise.all(V2[chainId].pools.map(async (p) => {
      const [[, spot], spacing, twap, minStep, quoteBal, baseBal] = await Promise.all([
        client.readContract({ address: p.address, abi: poolReads, functionName: 'slot0', blockNumber: block }),
        client.readContract({ address: p.address, abi: poolReads, functionName: 'tickSpacing', blockNumber: block }),
        twapTick(chainId, p.address, 300),
        V2[chainId].gridFactory ? client.readContract({ address: V2[chainId].gridFactory!, abi: gridBandFactoryAbi, functionName: 'minStep', args: [p.address, 30], blockNumber: block }) : Promise.resolve(null),
        client.readContract({ address: p.quote, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber: block }),
        client.readContract({ address: p.base, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber: block }),
      ])
      return { ...p, spotTick: spot, twapTick300: twap, tickSpacing: spacing, minStepAtSlip30: minStep === null ? null : Number(minStep), quoteBalance: quoteBal.toString(), baseBalance: baseBal.toString(),
        baseIsToken0: p.base.toLowerCase() < p.quote.toLowerCase() }
    }))
    return { kind, chainId, account, factory: V2[chainId].gridFactory, pools, blockNumber: block.toString(), readAt, fromChain: true as const }
  }
  // range: the owner's PancakeSwap v3 positions on reviewed pools, read from the position manager.
  const npm = V2[chainId].npm
  const n = Number(await client.readContract({ address: npm, abi: npmReads, functionName: 'balanceOf', args: [account], blockNumber: block }))
  const ids = await Promise.all(Array.from({ length: Math.min(n, 50) }, (_, i) => client.readContract({ address: npm, abi: npmReads, functionName: 'tokenOfOwnerByIndex', args: [account, BigInt(i)], blockNumber: block })))
  const positions = []
  for (const id of ids) {
    const pos = await client.readContract({ address: npm, abi: npmReads, functionName: 'positions', args: [id], blockNumber: block })
    const [, , t0, t1, fee, lower, upper, liquidity] = pos
    const pool = V2[chainId].pools.find((p) => p.fee === fee && [p.base.toLowerCase(), p.quote.toLowerCase()].sort().join() === [t0.toLowerCase(), t1.toLowerCase()].sort().join())
    if (!pool || liquidity === 0n) continue
    const [[, spot], twap] = await Promise.all([client.readContract({ address: pool.address, abi: poolReads, functionName: 'slot0', blockNumber: block }), twapTick(chainId, pool.address, 600)])
    positions.push({ tokenId: id.toString(), pool, token0: getAddress(t0), token1: getAddress(t1), fee, lower, upper, liquidity: liquidity.toString(), spotTick: spot, twapTick600: twap, inRange: spot >= lower && spot < upper })
  }
  return { kind, chainId, account, factory: V2[chainId].rangeFactory, npm, positionsOnReviewedPools: positions, positionsTotal: n, blockNumber: block.toString(), readAt, fromChain: true as const }
}

/**
 * Claims on each token (C5): the wallet balance beside every armed charter that may draw it, with its allowance and
 * its next need. An allowance is a ceiling, not a reservation; when the needs exceed the balance the page says so.
 */
export async function claimsFor(chainId: CharterChainId, owner: Address) {
  const client = chainClient(chainId)
  const armed = rowsOf<Row>(await chartersDb().execute(sql`${SELECT} where c.chain_id = ${chainId} and c.owner = ${owner.toLowerCase()} and c.ended_at is null and c.expires_at > now()`)).map(summarize)
  const v1 = rowsOf<{ address: string; token: string; budget: string; spent: string }>(await chartersDb().execute(sql`select address, token, budget, spent from charter_guard where chain_id = ${chainId} and owner = ${owner.toLowerCase()} and ended_at is null and expires_at > now()`))
  type Claim = { charter: Address; kind: CharterKind; version: 1 | 2; allowance: string; need: string; needIs: string }
  const byToken = new Map<string, Claim[]>()
  const add = (token: string, c: Claim) => { const k = token.toLowerCase(); byToken.set(k, [...(byToken.get(k) ?? []), c]) }
  const allowance = (token: Address, spender: Address) => client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] })
  for (const g of v1) {
    add(g.token, { charter: getAddress(g.address), kind: 'loan', version: 1, allowance: (await allowance(getAddress(g.token), getAddress(g.address))).toString(), need: (BigInt(g.budget) - BigInt(g.spent)).toString(), needIs: 'budget_left' })
  }
  for (const c of armed) {
    const p = (c.params['p'] ?? {}) as Record<string, string>
    if (c.kind === 'loan') {
      const m = CHARTER_CHAINS[chainId].markets.find((x) => x.vToken.toLowerCase() === String(p['vDebt']).toLowerCase())
      if (m) add(m.token, { charter: c.address, kind: c.kind, version: 2, allowance: (await allowance(m.token, c.address)).toString(), need: (BigInt(p['budget'] ?? '0') - BigInt(String(c.totals['spent'] ?? '0'))).toString(), needIs: 'budget_left' })
    } else if (c.kind === 'yield') {
      const m = CHARTER_CHAINS[chainId].markets.find((x) => x.vToken.toLowerCase() === String(p['vToken']).toLowerCase())
      if (m) add(m.token, { charter: c.address, kind: c.kind, version: 2, allowance: (await allowance(m.token, c.address)).toString(), need: String(p['floor'] ?? '0'), needIs: 'keeps_floor' })
    } else if (c.kind === 'grid' && c.pool) {
      add(c.pool.quote, { charter: c.address, kind: c.kind, version: 2, allowance: (await allowance(c.pool.quote, c.address)).toString(), need: String(p['orderQuote'] ?? '0'), needIs: 'next_buy' })
      add(c.pool.base, { charter: c.address, kind: c.kind, version: 2, allowance: (await allowance(c.pool.base, c.address)).toString(), need: '0', needIs: 'sells_what_it_bought' })
    }
  }
  const tokens = await Promise.all([...byToken.entries()].map(async ([token, claims]) => {
    const balance = await client.readContract({ address: token as Address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })
    const needs = claims.reduce((s, c) => s + BigInt(c.need), 0n)
    return { token: getAddress(token), balance: balance.toString(), claims, needsTotal: needs.toString(), short: needs > balance }
  }))
  return { chainId, owner: getAddress(owner), tokens, needsYou: tokens.filter((t) => t.short).length, readAt: new Date().toISOString(), fromChain: true as const }
}

