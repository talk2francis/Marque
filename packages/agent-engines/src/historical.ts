import type { PublicClient } from 'viem'
import { archiveClient, hasArchive, publicClient } from '@marque/chain'
import { blockNumber, resolveBlock, type BlockResolution } from './parse.js'
import { refuse, type Refusal } from './types.js'

/**
 * The block a benchmark task pins, and the client that can actually read it.
 *
 * Every engine that reads chain state resolves this ONCE, at the top of its
 * run. The rules, in order:
 *
 *   - No `Block: N` in the task  -> read head. Ordinary marketplace use.
 *   - `Block: N` within the public window -> read it off the pooled public
 *     nodes, same as before.
 *   - `Block: N` older than the window, archive endpoint configured -> read it
 *     off the archive client. `readAt` is set so every downstream read is
 *     pinned to exactly that block.
 *   - `Block: N` older than the window, NO archive endpoint -> a Refusal. The
 *     engine returns it. It must NOT fall back to head: answering for a block
 *     the task did not ask for, without saying so, is the quiet version of
 *     making the number up (the `?? head` this replaces).
 */
export interface HistoricalContext {
  resolution: BlockResolution
  client: PublicClient
  /** undefined = read head; a bigint = pin every read to this block. */
  readAt: bigint | undefined
}

export function historicalContext(prompt: string, head: bigint): HistoricalContext | Refusal {
  const res = resolveBlock(blockNumber(prompt), head, { archiveAvailable: hasArchive() })

  if (res.mode === 'unavailable') {
    return refuse(
      `HISTORICAL_STATE_UNAVAILABLE: block ${res.requested} is older than BNB Smart Chain public nodes retain, and no archive endpoint is configured`,
      'replaying a benchmark pinned to this block needs BSC_ARCHIVE_RPC_URL set server-side',
    )
  }

  if (res.mode === 'pinned' && res.source === 'archive') {
    const archive = archiveClient()
    if (!archive) {
      return refuse(`HISTORICAL_STATE_UNAVAILABLE: no archive client for block ${res.block}`)
    }
    return { resolution: res, client: archive, readAt: res.block }
  }

  if (res.mode === 'pinned') {
    return { resolution: res, client: publicClient(), readAt: res.block }
  }

  return { resolution: res, client: publicClient(), readAt: undefined }
}

/** Narrow a `HistoricalContext | Refusal` to the Refusal branch. */
export function isRefusal(x: HistoricalContext | Refusal): x is Refusal {
  return 'error' in x
}
