import { archiveClient } from '@marque/chain'
import { parseAbi } from 'viem'
import { within } from './types.js'

const unavailable = 'Historical chain observations are unavailable. No new quote can be issued. Try again later.'

/** Coalesce dependency reads; cache only a dated success/failure, never an engine answer. */
export function readinessGuard(read: () => Promise<void>, opts: { now?: () => number; successMs?: number; failureMs?: number } = {}) {
  const now = opts.now ?? Date.now
  let readyUntil = 0, failedUntil = 0
  let inflight: Promise<void> | null = null
  const check = async () => {
    if (now() < readyUntil) return
    if (now() < failedUntil) throw Error(unavailable)
    if (inflight) return inflight
    const attempt = (async () => {
      try {
        await read()
        readyUntil = now() + (opts.successMs ?? 60_000); failedUntil = 0
      } catch {
        readyUntil = 0; failedUntil = now() + (opts.failureMs ?? 15_000)
        throw Error(unavailable)
      }
    })()
    inflight = attempt
    try { await attempt } finally { if (inflight === attempt) inflight = null }
  }
  return Object.assign(check, { status: () => now() < readyUntil ? 'ready' : now() < failedUntil ? 'unavailable' : 'unknown' })
}

/** A historical state read, not an uptime claim or a substitute for the requested analysis. */
export const tidemarkHistoryReadiness = readinessGuard(async () => {
  await within((async () => {
    const client = archiveClient()
    if (!client) throw Error('archive unavailable')
    const head = await client.getBlockNumber()
    // Probe the same nominal seven-day block distance used by the engine.
    // No APR, duration or other financial measurement is inferred from this check.
    const block = head - 4n - 1_344_000n
    if (block <= 0n) throw Error('historical block unavailable')
    const rate = await client.readContract({
      address: '0xfD5840Cd36d94D7229439859C0112a4185BC0255',
      abi: parseAbi(['function exchangeRateStored() view returns (uint256)']),
      functionName: 'exchangeRateStored', blockNumber: block,
    })
    if (rate <= 0n) throw Error('historical state unavailable')
  })(), 5_000, 'historical chain observations')
})
