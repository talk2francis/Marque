import { sql } from 'drizzle-orm'
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, encodeFunctionData, type Abi, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { chartersDb as db } from '@marque/db'
import {
  CADENCE_MS, EXECUTORS, KIND_CODES, OPEN_KINDS, WOULD_ACT, stateName,
  loanGuardV2Abi, yieldSweepAbi, gridBandAbi, rangeKeeperAbi,
  type CharterChainId, type CharterKind,
} from '@marque/charters'
import { sessionForV2 } from './keys.js'
import type { AltanaClient } from '../sessions.js'

/**
 * Watching and acting for v2 charters (AGENTS.md C1, C10). The chain decides: a charter is only ever asked. Every
 * send is written to charter_attempt first (one open attempt per charter, enforced by the database), simulated
 * with eth_call from the sending address immediately before, and never resent blindly.
 *
 * Paths per kind: 'altana' (the kind's agent through its session key), 'direct' (the agent's own account, used by
 * Sluicegate for Yield Sweep), 'backup' (Marque's backup watcher: any open kind, and a named kind only when the
 * owner named it). Kinds run in a fixed order each tick, Yield Sweep before Grid Band, so a sweep that refills the
 * wallet acts before the grid's next buy reads it (04_ARCHITECTURE, cross-category rule 4).
 */
export const ABI: Record<CharterKind, Abi> = { loan: loanGuardV2Abi, yield: yieldSweepAbi, grid: gridBandAbi, range: rangeKeeperAbi }
export const ORDER: CharterKind[] = ['loan', 'yield', 'grid', 'range']
const SAMPLE_EVERY_MS = 10 * 60_000
const LEASE_MS = 90_000
const DEGRADED_MS = 5 * 60_000
const rowsOf = <T = Record<string, unknown>>(r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[]
const actData = (kind: CharterKind) => encodeFunctionData({ abi: ABI[kind], functionName: 'act' })

export type PathV2 = 'altana' | 'direct' | 'backup'

/** Who may send for this charter, from its kind and the executors the owner named. */
export function allowedPaths(kind: CharterKind, executors: string[], agentDirect: boolean): { direct: boolean; backup: boolean } {
  const named = new Set(executors.map((e) => e.toLowerCase()))
  const open = OPEN_KINDS.has(kind)
  return {
    direct: agentDirect && (open || named.has(EXECUTORS[agentFor(kind)].toLowerCase())),
    backup: open || named.has(EXECUTORS.backup.toLowerCase()),
  }
}
const agentFor = (k: CharterKind) => ({ loan: 'keel', yield: 'sluicegate', grid: 'lattice', range: 'bound' } as const)[k]

/**
 * The path for the next send. The agent first (its session, else its own account), the backup when the agent has
 * no usable path or its send has not landed within the grace window. Never two sends in flight for one charter.
 */
export function choosePathV2(x: {
  open: { path: PathV2; status: string; sentAt: number | null } | null
  altanaReady: boolean; direct: boolean; backup: boolean; now: number; graceMs: number
}): { action: 'send'; path: PathV2; supersede: boolean } | { action: 'wait' } | { action: 'none' } {
  if (!x.open) {
    if (x.altanaReady) return { action: 'send', path: 'altana', supersede: false }
    if (x.direct) return { action: 'send', path: 'direct', supersede: false }
    if (x.backup) return { action: 'send', path: 'backup', supersede: false }
    return { action: 'none' }
  }
  const late = (x.open.status === 'pending' || x.open.status === 'sent') && x.open.sentAt !== null && x.now - x.open.sentAt >= x.graceMs
  if (late && x.open.path !== 'backup' && x.backup) return { action: 'send', path: 'backup', supersede: true }
  return { action: 'wait' }
}

export function revertReasonV2(kind: CharterKind, e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    if (r?.data?.errorName) return r.data.errorName
    const data = (e.walk((x) => typeof (x as { data?: unknown }).data === 'string') as { data?: Hex } | null)?.data
    if (typeof data === 'string' && data.startsWith('0x') && data.length >= 10) {
      try { return decodeErrorResult({ abi: ABI[kind], data }).errorName } catch { /* not a charter error */ }
    }
    return e.shortMessage.slice(0, 160)
  }
  return e instanceof Error ? e.message.slice(0, 160) : String(e)
}

export interface WatchV2Context {
  chainId: CharterChainId
  client: PublicClient
  master: Hex | null
  altana: AltanaClient | null
  altanaKinds: ReadonlySet<CharterKind>
  /** The agents' own accounts loaded in this process for direct sends (Sluicegate by default). */
  direct: Partial<Record<CharterKind, WalletClient>>
  backup: WalletClient | null
  /** Sends for grid and range go through this client when a private submission endpoint is configured. */
  privateSend: WalletClient | null
  graceMs: number
  dryRun: boolean
  enabled: { altana: boolean; direct: boolean; backup: boolean }
  kinds: ReadonlySet<CharterKind>
  log: (event: string, data: Record<string, unknown>) => void
  onSpend: (path: 'direct' | 'backup', wei: bigint) => void
}

export interface WatchV2Pass { armed: Record<string, number>; wouldAct: number; sent: Array<{ charter: string; kind: CharterKind; path: PathV2; ref: string }>; readErrors: Record<string, number>; states: Record<string, number>; closed: number }

const degraded = new Map<string, number>()
const lastSample = new Map<string, { at: number; state: number }>()
const nextRead = new Map<string, number>()

async function close(id: string, status: string, f: { tx?: string | null; error?: string | null } = {}) {
  await db().execute(sql`update charter_attempt set status = ${status}, tx_hash = coalesce(${f.tx ?? null}, tx_hash), error = coalesce(${f.error ?? null}, error), closed_at = now() where id = ${id}`)
}

/** Settle direct and backup sends of v2 charters (relay calls are settled by the v1 reconcile, which reads every attempt). */
async function reconcileV2(ctx: WatchV2Context): Promise<number> {
  let n = 0
  const open = rowsOf<{ id: string; address: string; path: PathV2; status: string; tx_hash: string | null; lease_until: string }>(await db().execute(sql`
    select a.id, a.address, a.path, a.status, a.tx_hash, a.lease_until from charter_attempt a
    join charter_v2 c on c.chain_id = a.chain_id and c.address = a.address
    where a.chain_id = ${ctx.chainId} and a.status in ('prepared', 'sent') and a.path in ('direct', 'backup')`))
  for (const a of open) {
    if (a.tx_hash) {
      const r = await ctx.client.getTransactionReceipt({ hash: a.tx_hash as Hex }).catch(() => null)
      if (r) { await close(a.id, r.status === 'success' ? 'confirmed' : 'reverted'); n += 1 }
    } else if (new Date(a.lease_until).getTime() < Date.now()) {
      await close(a.id, 'failed', { error: 'lease expired before sending' }); n += 1
    }
  }
  return n
}

function sample(kind: CharterKind, r: readonly unknown[]): Record<string, string | boolean | number> {
  const s = (v: unknown) => (typeof v === 'bigint' ? v.toString() : (v as string | boolean | number))
  const names: Record<CharterKind, string[]> = {
    loan: ['state', 'health', 'wouldRepay', 'available', 'debt'],
    yield: ['state', 'amount', 'walletBalance', 'heldUnderlying'],
    grid: ['state', 'slot', 'buy', 'amountIn', 'twapTick', 'spotTick'],
    range: ['state', 'twapTick', 'spotTick', 'lower', 'upper'],
  }
  return Object.fromEntries(names[kind].map((n, i) => [n, s(r[i])]))
}

async function send(ctx: WatchV2Context, kind: CharterKind, charter: Address, path: PathV2, session: unknown, id: string): Promise<string> {
  const data = actData(kind)
  if (path === 'altana') {
    const sess = sessionForV2(ctx.master!, ctx.chainId, kind, charter, session)
    const r = await ctx.altana!.execute({ session: sess, calls: [{ to: charter, data }], chainId: ctx.chainId, noWait: true })
    await db().execute(sql`update charter_attempt set status = 'pending', calls_id = ${r.callsId}, sent_at = now() where id = ${id}`)
    return r.callsId
  }
  const w = path === 'direct' ? ctx.direct[kind]! : ctx.backup!
  const via = (kind === 'grid' || kind === 'range') && ctx.privateSend && w === ctx.backup ? ctx.privateSend : w
  const gas = (await ctx.client.estimateGas({ account: w.account!, to: charter, data })) * 13n / 10n
  const gasPrice = await ctx.client.getGasPrice()
  const hash = await via.sendTransaction({ account: w.account!, chain: w.chain, to: charter, data, gas, gasPrice })
  ctx.onSpend(path, gas * gasPrice)
  await db().execute(sql`update charter_attempt set status = 'sent', tx_hash = ${hash}, sent_at = now() where id = ${id}`)
  return hash
}

export async function watchOnceV2(ctx: WatchV2Context): Promise<WatchV2Pass> {
  const out: WatchV2Pass = { armed: {}, wouldAct: 0, sent: [], readErrors: {}, states: {}, closed: 0 }
  out.closed = await reconcileV2(ctx)
  for (const kind of ORDER) {
    if (!ctx.kinds.has(kind)) continue
    const key = `${ctx.chainId}:${kind}`
    if (Date.now() < (nextRead.get(key) ?? 0)) continue
    nextRead.set(key, Date.now() + CADENCE_MS[kind][ctx.chainId])
    const armed = rowsOf<{ address: string; executors: string[] }>(await db().execute(sql`
      select address, executors from charter_v2 where chain_id = ${ctx.chainId} and kind = ${KIND_CODES[kind]} and ended_at is null and expires_at > now() order by created_block`))
    out.armed[kind] = armed.length
    if (!armed.length) continue
    const block = await ctx.client.getBlockNumber()
    const previews = await ctx.client.multicall({ allowFailure: true, blockNumber: block, contracts: armed.map((c) => ({ address: c.address as Address, abi: ABI[kind], functionName: 'preview' })) })
    for (let i = 0; i < armed.length; i++) {
      const charter = armed[i]!.address as Address
      const p = previews[i]!
      if (p.status !== 'success') { out.readErrors[kind] = (out.readErrors[kind] ?? 0) + 1; continue } // oracle or pool history unavailable
      const r = p.result as unknown as readonly unknown[]
      const code = Number(r[0])
      const name = `${kind}:${stateName(kind, code)}`
      out.states[name] = (out.states[name] ?? 0) + 1
      const ls = lastSample.get(charter)
      if (!ctx.dryRun && (!ls || ls.state !== code || Date.now() - ls.at >= SAMPLE_EVERY_MS)) {
        await db().execute(sql`insert into charter_v2_sample (chain_id, address, kind, block_number, state, data) values (${ctx.chainId}, ${charter.toLowerCase()}, ${KIND_CODES[kind]}, ${block.toString()}, ${code}, ${JSON.stringify(sample(kind, r))}::jsonb)`)
        lastSample.set(charter, { at: Date.now(), state: code })
      }
      if (!WOULD_ACT[kind].has(code)) continue
      out.wouldAct += 1

      const [openRow] = rowsOf<{ id: string; path: PathV2; status: string; sent_at: string | null }>(await db().execute(sql`
        select id, path, status, sent_at from charter_attempt where chain_id = ${ctx.chainId} and address = ${charter.toLowerCase()} and status in ('prepared', 'sent', 'pending') limit 1`))
      const [k] = rowsOf<{ session: unknown; status: string }>(await db().execute(sql`select session, status from charter_watch_key where chain_id = ${ctx.chainId} and guard = ${charter.toLowerCase()}`))
      const altanaReady = ctx.enabled.altana && ctx.altanaKinds.has(kind) && ctx.altana !== null && ctx.master !== null && k?.status === 'registered' && k.session !== null && (degraded.get(charter) ?? 0) < Date.now()
      const allowed = allowedPaths(kind, armed[i]!.executors, ctx.enabled.direct && Boolean(ctx.direct[kind]))
      const choice = choosePathV2({
        open: openRow ? { path: openRow.path, status: openRow.status, sentAt: openRow.sent_at ? new Date(openRow.sent_at).getTime() : null } : null,
        altanaReady, direct: allowed.direct, backup: allowed.backup && ctx.enabled.backup && ctx.backup !== null, now: Date.now(), graceMs: ctx.graceMs,
      })
      if (choice.action === 'none') { ctx.log('v2_no_path', { chainId: ctx.chainId, charter, kind }); continue }
      if (choice.action === 'wait') continue
      if (ctx.dryRun) { ctx.log('v2_would_send', { chainId: ctx.chainId, charter, kind, path: choice.path }); continue }
      const from = (choice.path === 'altana' ? EXECUTORS[agentFor(kind)] : choice.path === 'direct' ? ctx.direct[kind]!.account!.address : ctx.backup!.account!.address) as Address
      let reason: string | null = null
      try { await ctx.client.simulateContract({ account: from, address: charter, abi: ABI[kind], functionName: 'act' }) } catch (e) { reason = revertReasonV2(kind, e) }
      if (reason) { ctx.log('v2_simulation_refused', { chainId: ctx.chainId, charter, kind, path: choice.path, reason }); continue }
      if (choice.supersede && openRow) await close(openRow.id, 'superseded', { error: 'the agent had not landed within the grace window; the backup acts' })
      let id: string
      try {
        const [row] = rowsOf<{ id: string }>(await db().execute(sql`insert into charter_attempt (chain_id, address, path, status, sender, lease_until)
          values (${ctx.chainId}, ${charter.toLowerCase()}, ${choice.path}, 'prepared', ${from.toLowerCase()}, now() + make_interval(secs => ${LEASE_MS / 1000})) returning id`))
        id = row!.id
      } catch { continue } // another worker holds the open attempt
      try {
        const ref = await send(ctx, kind, charter, choice.path, k?.session, id)
        out.sent.push({ charter, kind, path: choice.path, ref })
        ctx.log('v2_act_sent', { chainId: ctx.chainId, charter, kind, path: choice.path, ref })
      } catch (e) {
        const error = e instanceof Error ? e.message.slice(0, 300) : String(e)
        await close(id, 'failed', { error })
        if (choice.path === 'altana') degraded.set(charter, Date.now() + DEGRADED_MS)
        ctx.log('v2_act_send_failed', { chainId: ctx.chainId, charter, kind, path: choice.path, error })
      }
    }
  }
  return out
}
