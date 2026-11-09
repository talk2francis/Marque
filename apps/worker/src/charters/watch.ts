import { sql } from 'drizzle-orm'
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, encodeFunctionData, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { db } from '@marque/db'
import { loanGuardAbi, STATE_CODES, type CharterChainId, type GuardState } from '@marque/charters'
import { networkOf, sessionFor, type AltanaClient, type Keel } from './sessions.js'

/**
 * Watching and acting (AGENTS.md C1, C9). The chain decides: a guard is only ever asked, never told. Every send is
 * written to charter_attempt before it goes out, simulated with eth_call from the sending address immediately
 * before, and never resent blindly. One open attempt per guard is enforced by a partial unique index.
 */
export const ACT_DATA = encodeFunctionData({ abi: loanGuardAbi, functionName: 'act' })
const SAMPLE_EVERY_MS = 10 * 60_000
const LEASE_MS = 90_000
const ALTANA_DEGRADED_MS = 5 * 60_000

const rowsOf = <T = Record<string, unknown>>(r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[]

/** EIP-5792 status codes as the relay reports them: 2xx confirmed, 3xx to 6xx failed, anything else still in flight. */
export function relayOutcome(code: unknown): 'confirmed' | 'failed' | 'pending' {
  if (code === 'CONFIRMED' || (typeof code === 'number' && code >= 200 && code < 300)) return 'confirmed'
  if (code === 'FAILED' || (typeof code === 'number' && code >= 300 && code < 700)) return 'failed'
  return 'pending'
}

export type Path = 'altana' | 'backup'

/**
 * Which path presses the button, given what is already in flight. Keel through Altana first when its session is
 * registered and the path is healthy; the backup watcher when there is no usable session, the Altana path is
 * degraded or paused, or Keel's call has not landed within the grace window.
 */
export function choosePath(x: {
  open: { path: Path; status: string; sentAt: number | null } | null
  altanaReady: boolean
  now: number
  graceMs: number
}): { action: 'send'; path: Path; supersede: boolean } | { action: 'wait' } {
  if (!x.open) return { action: 'send', path: x.altanaReady ? 'altana' : 'backup', supersede: false }
  if (x.open.path === 'altana' && (x.open.status === 'pending' || x.open.status === 'sent') && x.open.sentAt !== null && x.now - x.open.sentAt >= x.graceMs) {
    return { action: 'send', path: 'backup', supersede: true }
  }
  return { action: 'wait' }
}

/** The reason a simulated act() would revert, in the guard's own words where it has them. */
export function revertReason(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    if (r?.data?.errorName) return r.data.errorName
    const data = (e.walk((x) => typeof (x as { data?: unknown }).data === 'string') as { data?: Hex } | null)?.data
    if (typeof data === 'string' && data.startsWith('0x') && data.length >= 10) {
      try { return decodeErrorResult({ abi: loanGuardAbi, data }).errorName } catch { /* not a guard error */ }
    }
    return e.shortMessage.slice(0, 160)
  }
  return e instanceof Error ? e.message.slice(0, 160) : String(e)
}

export interface WatchContext {
  chainId: CharterChainId
  client: PublicClient
  keel: Keel | null
  altana: AltanaClient | null
  backup: WalletClient | null
  graceMs: number
  dryRun: boolean
  /** Paths can be turned off by flag or by a daily cap, without touching the other. */
  altanaEnabled: boolean
  backupEnabled: boolean
  log: (event: string, data: Record<string, unknown>) => void
  /** Called with the native cost of each backup send, so the caller can keep its daily cap. */
  onBackupSpend: (wei: bigint) => void
}

export interface WatchPass {
  armed: number
  wouldAct: number
  sampled: number
  sent: Array<{ guard: string; path: Path; ref: string }>
  closed: Array<{ guard: string; status: string }>
  readErrors: number
  states: Record<string, number>
}

const altanaDegradedUntil = new Map<string, number>()
const lastSampleState = new Map<string, { at: number; state: number }>()

async function relayStatus(chainId: CharterChainId, callsId: string): Promise<unknown> {
  const url = networkOf(chainId).relayUrl
  if (!url) return null
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'wallet_getCallsStatus', params: [callsId] }), signal: AbortSignal.timeout(15_000) })
  const j = await r.json() as { result?: { status?: unknown; receipts?: Array<{ transactionHash?: string }> } }
  return j.result ?? null
}

async function close(id: string, status: string, fields: { tx?: string | null; error?: string | null } = {}) {
  await db().execute(sql`update charter_attempt set status = ${status}, tx_hash = coalesce(${fields.tx ?? null}, tx_hash),
    error = coalesce(${fields.error ?? null}, error), closed_at = now() where id = ${id}`)
}

/** Settle what is in flight before deciding anything new. */
async function reconcile(ctx: WatchContext, out: WatchPass) {
  const open = rowsOf<{ id: string; address: string; path: Path; status: string; calls_id: string | null; tx_hash: string | null; lease_until: string }>(await db().execute(sql`
    select id, address, path, status, calls_id, tx_hash, lease_until from charter_attempt
    where chain_id = ${ctx.chainId} and status in ('prepared', 'sent', 'pending')`))
  for (const a of open) {
    try {
      if (a.path === 'altana' && a.calls_id) {
        const s = await relayStatus(ctx.chainId, a.calls_id) as { status?: unknown; receipts?: Array<{ transactionHash?: string }> } | null
        const o = relayOutcome(s?.status)
        if (o === 'confirmed') { await close(a.id, 'confirmed', { tx: s?.receipts?.[0]?.transactionHash ?? null }); out.closed.push({ guard: a.address, status: 'confirmed' }) }
        else if (o === 'failed') {
          await close(a.id, 'failed', { error: `relay status ${String(s?.status)}` })
          altanaDegradedUntil.set(a.address, Date.now() + ALTANA_DEGRADED_MS)
          out.closed.push({ guard: a.address, status: 'failed' })
          ctx.log('altana_failed', { chainId: ctx.chainId, guard: a.address, status: s?.status ?? null })
        }
      } else if (a.path === 'backup' && a.tx_hash) {
        const r = await ctx.client.getTransactionReceipt({ hash: a.tx_hash as Hex }).catch(() => null)
        if (r) { await close(a.id, r.status === 'success' ? 'confirmed' : 'reverted'); out.closed.push({ guard: a.address, status: r.status === 'success' ? 'confirmed' : 'reverted' }) }
      } else if (a.status === 'prepared' && new Date(a.lease_until).getTime() < Date.now()) {
        // Prepared but never sent (the process stopped between the two): nothing went out.
        await close(a.id, 'failed', { error: 'lease expired before sending' })
        out.closed.push({ guard: a.address, status: 'failed' })
      }
    } catch (e) {
      ctx.log('reconcile_error', { chainId: ctx.chainId, guard: a.address, error: e instanceof Error ? e.message.slice(0, 200) : String(e) })
    }
  }
}

/** eth_call act() from the address that would send it; null when the chain would accept it, else the reason. */
async function simulate(ctx: WatchContext, from: Address, guard: Address): Promise<string | null> {
  try { await ctx.client.simulateContract({ account: from, address: guard, abi: loanGuardAbi, functionName: 'act' }); return null } catch (e) { return revertReason(e) }
}

async function sendAltana(ctx: WatchContext, guard: string, session: unknown, id: string): Promise<string> {
  const sess = sessionFor(ctx.keel!, ctx.chainId, guard, session)
  const r = await ctx.altana!.execute({ session: sess, calls: [{ to: guard as Address, data: ACT_DATA }], chainId: ctx.chainId, noWait: true })
  await db().execute(sql`update charter_attempt set status = 'pending', calls_id = ${r.callsId}, sent_at = now() where id = ${id}`)
  return r.callsId
}

async function sendBackup(ctx: WatchContext, guard: string, id: string): Promise<string> {
  const w = ctx.backup!
  const gas = (await ctx.client.estimateGas({ account: w.account!, to: guard as Address, data: ACT_DATA })) * 13n / 10n
  const gasPrice = await ctx.client.getGasPrice()
  const hash = await w.sendTransaction({ account: w.account!, chain: w.chain, to: guard as Address, data: ACT_DATA, gas, gasPrice })
  ctx.onBackupSpend(gas * gasPrice)
  await db().execute(sql`update charter_attempt set status = 'sent', tx_hash = ${hash}, sent_at = now() where id = ${id}`)
  return hash
}

export async function watchOnce(ctx: WatchContext): Promise<WatchPass> {
  const out: WatchPass = { armed: 0, wouldAct: 0, sampled: 0, sent: [], closed: [], readErrors: 0, states: {} }
  await reconcile(ctx, out)

  const armed = rowsOf<{ address: string }>(await db().execute(sql`
    select address from charter_guard where chain_id = ${ctx.chainId} and ended_at is null and expires_at > now() order by created_block`))
  out.armed = armed.length
  if (!armed.length) return out
  const block = await ctx.client.getBlockNumber()
  const previews = await ctx.client.multicall({ contracts: armed.map((g) => ({ address: g.address as Address, abi: loanGuardAbi, functionName: 'preview' as const })), allowFailure: true, blockNumber: block })

  for (let i = 0; i < armed.length; i++) {
    const guard = armed[i]!.address
    const p = previews[i]!
    if (p.status !== 'success') { out.readErrors += 1; continue } // Venus could not price a market: nothing can act now
    const [stateCode, health, wouldRepay, , available, debt] = p.result
    const state: GuardState = STATE_CODES[stateCode] ?? 'watching'
    out.states[state] = (out.states[state] ?? 0) + 1

    const last = lastSampleState.get(guard)
    if (!ctx.dryRun && (!last || last.state !== stateCode || Date.now() - last.at >= SAMPLE_EVERY_MS)) {
      await db().execute(sql`insert into charter_guard_sample (chain_id, address, block_number, state, health, debt, available, would_repay)
        values (${ctx.chainId}, ${guard}, ${block.toString()}, ${stateCode}, ${health.toString()}, ${debt.toString()}, ${available.toString()}, ${wouldRepay.toString()})`)
      lastSampleState.set(guard, { at: Date.now(), state: stateCode })
      out.sampled += 1
    }
    if (state !== 'would_act') continue
    out.wouldAct += 1

    const [openRow] = rowsOf<{ id: string; path: Path; status: string; sent_at: string | null }>(await db().execute(sql`
      select id, path, status, sent_at from charter_attempt where chain_id = ${ctx.chainId} and address = ${guard} and status in ('prepared', 'sent', 'pending') limit 1`))
    const [key] = rowsOf<{ session: unknown; status: string }>(await db().execute(sql`
      select session, status from charter_watch_key where chain_id = ${ctx.chainId} and guard = ${guard}`))
    const altanaReady = ctx.altanaEnabled && ctx.keel !== null && ctx.altana !== null && key?.status === 'registered' && key.session !== null
      && (altanaDegradedUntil.get(guard) ?? 0) < Date.now()
    const choice = choosePath({ open: openRow ? { path: openRow.path, status: openRow.status, sentAt: openRow.sent_at ? new Date(openRow.sent_at).getTime() : null } : null, altanaReady, now: Date.now(), graceMs: ctx.graceMs })
    if (choice.action === 'wait') continue
    if (choice.path === 'backup' && (!ctx.backupEnabled || !ctx.backup)) { ctx.log('backup_unavailable', { chainId: ctx.chainId, guard }); continue }
    if (ctx.dryRun) { ctx.log('would_send', { chainId: ctx.chainId, guard, path: choice.path }); continue }
    const from = (choice.path === 'altana' ? ctx.keel!.address : ctx.backup!.account!.address) as Address
    const reason = await simulate(ctx, from, guard as Address)
    if (reason) { ctx.log('simulation_refused', { chainId: ctx.chainId, guard, path: choice.path, reason }); continue }
    // Only now, with the chain saying the guard still needs it, does the backup take over from Keel's late call.
    if (choice.supersede && openRow) await close(openRow.id, 'superseded', { error: 'Keel had not landed within the grace window; the backup watcher acts' })

    let id: string
    try {
      const [row] = rowsOf<{ id: string }>(await db().execute(sql`insert into charter_attempt (chain_id, address, path, status, lease_until)
        values (${ctx.chainId}, ${guard}, ${choice.path}, 'prepared', now() + make_interval(secs => ${LEASE_MS / 1000})) returning id`))
      id = row!.id
    } catch { continue } // another worker holds the open attempt
    try {
      const ref = choice.path === 'altana' ? await sendAltana(ctx, guard, key!.session, id) : await sendBackup(ctx, guard, id)
      out.sent.push({ guard, path: choice.path, ref })
      ctx.log('act_sent', { chainId: ctx.chainId, guard, path: choice.path, ref })
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 300) : String(e)
      await close(id, 'failed', { error })
      if (choice.path === 'altana') altanaDegradedUntil.set(guard, Date.now() + ALTANA_DEGRADED_MS)
      ctx.log('act_send_failed', { chainId: ctx.chainId, guard, path: choice.path, error })
    }
  }
  return out
}

