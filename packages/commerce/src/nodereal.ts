import type { ChainId } from './config.js'

/**
 * NodeReal MegaNode enhanced reads (free account, G-T1, FACTS 12). Server-side only: the URL
 * carries the key, so it is never logged, returned or sent to a browser.
 *
 * `nr_getTransactionByAddress` lists an address's transactions newest first, with the block
 * time, the target and the receipt status, on both BSC mainnet and testnet. It is the only
 * free source of "what did this wallet do" without running an indexer.
 */
export interface AddressTx {
  hash: string
  from: string
  to: string
  /** Hex wei for BNB, hex token units for "20". */
  value: string
  asset: string
  category: 'external' | '20' | '721' | string
  contractAddress: string
  /** ERC-721 token id (decimal), for category 721. */
  tokenId: string | null
  blockTimeStamp: number
  ok: boolean
}

export function nodeRealUrl(chainId: ChainId): string | null {
  const key = process.env['NODEREAL_API_KEY']?.trim()
  if (!key) return null
  return chainId === 56 ? `https://bsc-mainnet.nodereal.io/v1/${key}` : `https://bsc-testnet.nodereal.io/v1/${key}`
}

export const hasNodeReal = (): boolean => Boolean(process.env['NODEREAL_API_KEY']?.trim())

/** Strip anything that could carry the key out of an error message. */
const scrub = (s: string) => s.replace(/https?:\/\/\S+/g, '[rpc]').slice(0, 200)

/**
 * Transactions of one category to or from `address`, newest first, back to `sinceSec`.
 * Stops after `maxPages` pages of 1000 and says so with `truncated`.
 */
export async function addressTransactions(chainId: ChainId, address: string, opts: {
  category: 'external' | '20' | '721'
  direction: 'from' | 'to'
  sinceSec: number
  untilSec?: number
  maxPages?: number
  timeoutMs?: number
}): Promise<{ txs: AddressTx[]; truncated: boolean }> {
  const url = nodeRealUrl(chainId)
  if (!url) throw new Error('NodeReal is not configured')
  const txs: AddressTx[] = []
  let pageKey: string | undefined
  for (let page = 0; page < (opts.maxPages ?? 5); page++) {
    const params: Record<string, unknown> = {
      category: [opts.category], addressType: opts.direction, address, order: 'desc', excludeZeroValue: false, maxCount: '0x3e8',
    }
    if (pageKey) params['pageKey'] = pageKey
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8_000)
    let body: { result?: { transfers?: Array<Record<string, unknown>>; pageKey?: string }; error?: { message?: string } }
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'nr_getTransactionByAddress', params: [params] }), signal: ctl.signal })
      body = await res.json() as typeof body
    } catch (e) {
      throw new Error(`transaction history unavailable: ${scrub(e instanceof Error ? e.message : String(e))}`)
    } finally { clearTimeout(timer) }
    if (body.error) throw new Error(`transaction history unavailable: ${scrub(body.error.message ?? 'error')}`)
    const list = body.result?.transfers ?? []
    let older = false
    for (const t of list) {
      const at = Number(t['blockTimeStamp'] ?? 0)
      if (at < opts.sinceSec) { older = true; break }
      if (opts.untilSec && at > opts.untilSec) continue
      txs.push({
        hash: String(t['hash'] ?? ''), from: String(t['from'] ?? '').toLowerCase(), to: String(t['to'] ?? '').toLowerCase(),
        value: String(t['value'] ?? '0x0'), asset: String(t['asset'] ?? ''), category: String(t['category'] ?? ''),
        contractAddress: String(t['contractAddress'] ?? '').toLowerCase(), blockTimeStamp: at,
        tokenId: typeof t['erc721TokenId'] === 'string' ? BigInt(t['erc721TokenId'] as string).toString() : null,
        ok: t['receiptsStatus'] === undefined ? true : Number(t['receiptsStatus']) === 1,
      })
    }
    pageKey = body.result?.pageKey || undefined
    if (older || !pageKey || list.length === 0) return { txs, truncated: false }
  }
  return { txs, truncated: Boolean(pageKey) }
}
