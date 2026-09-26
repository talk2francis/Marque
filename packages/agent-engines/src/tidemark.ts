import { parseAbi, type Address, type PublicClient } from 'viem'
import { yieldReader, netAprAtSize, type YieldVenue } from '@marque/positions'
import { archiveClient, publicClient } from '@marque/chain'
import { num } from './parse.js'
import { refuse, within, type Engine, type EngineAnswer, type EngineMeta, type Inspection } from './types.js'

/**
 * Tidemark — realised yield.
 *
 * Sluicegate reads the rate a venue quotes right now. Tidemark reads what a
 * venue actually PAID: the growth of its on-chain exchange rate between two
 * blocks, annualised. A quoted rate is a promise about the next block; the
 * realised rate is a fact about the last week, and the two part company
 * whenever utilisation swings or an incentive ends. Showing both, side by side,
 * is the point: a venue whose quote runs far above what it has been paying is
 * a venue whose quote is about to fall.
 *
 * It also covers what Sluicegate cannot: BNB liquid staking, where there is no
 * quoted rate at all and the exchange rate is the only honest source.
 *
 *     realisedApr = (rateNow / rateThen - 1) × (365 / days)
 *
 * Simple, not compounded, and stated as such. Both reads come from the same
 * archive endpoint so neither side of the ratio is read off a different node.
 */

export const TIDEMARK_META: EngineMeta = {
  id: 'tidemark',
  name: 'Tidemark',
  category: 'yield',
  testId: null,
  description:
    'Measures the yield BNB Chain venues actually paid over a trailing window, from on-chain exchange-rate growth, and compares it with what each venue quotes today. Covers Venus supply markets and BNB liquid staking (slisBNB, ankrBNB). Non-custodial: it reads, it never signs.',
  priceUsd: 0.1,
  skills: [
    {
      id: 'realised-yield',
      name: 'Realised yield over a trailing window',
      description: 'Annualised exchange-rate growth between two archived blocks, per venue, with both block numbers.',
      tags: ['yield', 'realised apr', 'venus', 'liquid staking'],
    },
    {
      id: 'quote-vs-paid',
      name: 'Quoted versus paid',
      description: 'The gap between each venue’s current quoted rate and what it paid, so a rate about to fall is visible before you move.',
      tags: ['yield', 'apr', 'rate stability'],
    },
  ],
}

const BLOCK_SECONDS = 0.45
const DEFAULT_DAYS = 7
const ONE = 10n ** 18n

/** Liquid staking tokens with a readable BNB-per-token rate. Verified on chain 26 Sep 2026. */
const LSTS: Array<{ name: string; token: string; address: Address; abi: string; fn: string }> = [
  { name: 'Lista slisBNB', token: 'slisBNB', address: '0x1adB950d8bB3dA4bE104211D5AB038628e477fE6', abi: 'function convertSnBnbToBnb(uint256) view returns (uint256)', fn: 'convertSnBnbToBnb' },
  { name: 'Ankr ankrBNB', token: 'ankrBNB', address: '0x52F24a5e03aee338Da5fd9Df68D2b6FAe1178827', abi: 'function sharesToBonds(uint256) view returns (uint256)', fn: 'sharesToBonds' },
]
/** Named so a buyer asking about it hears why it is missing, not silence. */
const LST_EXCLUDED = [
  { token: 'BNBx', reason: 'Stader’s current stake manager reports no rate movement across the window and the older one reports an implausible rate, so neither can be trusted' },
]

const ASSETS = 'USDT|USDC|USD1|FDUSD|DAI|TUSD|BNB|WBNB|BTCB|ETH'

interface Ask { asset: string; amount: number; days: number; assumptions: string[] }

export function parseTidemark(prompt: string): Ask | { missing: string[] } {
  const asset = (prompt.match(new RegExp(String.raw`\d[\d,]*(?:\.\d+)?\s*(${ASSETS})\b`, 'i'))?.[1]
    ?? prompt.match(new RegExp(String.raw`\b(?:of|my|in|for)\s+(${ASSETS})\b`, 'i'))?.[1]
    ?? prompt.match(new RegExp(String.raw`\basset\s+(${ASSETS})\b`, 'i'))?.[1])?.toUpperCase()
  const amount = num(
    prompt,
    String.raw`%N%\s*(?:${ASSETS})\b`,
    String.raw`\$\s*%N%`,
    String.raw`size\s+%N%`,
    String.raw`%N%\s*USD\b`,
  )
  const daysRaw = num(prompt, String.raw`(?:last|past|trailing|over)\s+%N%\s*days?`, String.raw`%N%[\s-]*days?\b`)
  const weeks = /\b(?:last|past|trailing|over the)\s+(?:week)\b/i.test(prompt) ? 7 : /\b(?:last|past|trailing|over the)\s+month\b/i.test(prompt) ? 30 : null

  const missing: string[] = []
  if (!asset) missing.push('the asset (for example USDT or BNB)')
  if (amount === null) missing.push('the amount to deploy')
  if (missing.length) return { missing }

  const assumptions: string[] = []
  const days = daysRaw ?? weeks ?? DEFAULT_DAYS
  if (daysRaw === null && weeks === null) assumptions.push(`no window stated; realised yield is measured over the last ${DEFAULT_DAYS} days`)
  if (days < 1 || days > 90) return { missing: ['a window between 1 and 90 days'] }
  return { asset: asset as string, amount: amount as number, days, assumptions }
}

async function rateAt(client: PublicClient, address: Address, abi: string, fn: string, args: bigint[], block: bigint): Promise<bigint> {
  return client.readContract({ address, abi: parseAbi([abi]), functionName: fn, args, blockNumber: block } as never) as Promise<bigint>
}

const VTOKEN_RATE = 'function exchangeRateStored() view returns (uint256)'

export const tidemarkEngine: Engine = {
  meta: TIDEMARK_META,
  inspect(prompt): Inspection {
    const a = parseTidemark(prompt)
    return 'missing' in a ? { missing: a.missing, assumptions: [] } : { missing: [], assumptions: a.assumptions }
  },
  async run(prompt, opts = {}): Promise<EngineAnswer> {
    const deadline = opts.deadlineMs ?? 12_000
    const ask = parseTidemark(prompt)
    if ('missing' in ask) {
      return refuse(`the task does not state ${ask.missing.join(', ')}`, 'realised yield is compared at the size you would actually move')
    }
    const archive = archiveClient()
    if (!archive) {
      return refuse('HISTORICAL_STATE_UNAVAILABLE: realised yield needs an archive endpoint and none is configured')
    }

    try {
      // A few blocks behind the archive's reported head: it can report a block
      // before it will serve it.
      const head = (await within(archive.getBlockNumber(), 3_000, 'the BNB Smart Chain archive')) - 4n
      const then = head - BigInt(Math.round((ask.days * 86_400) / BLOCK_SECONDS))
      // The window's true length, from the two block timestamps, not the nominal days.
      const [bNow, bThen] = await within(
        Promise.all([archive.getBlock({ blockNumber: head }), archive.getBlock({ blockNumber: then })]),
        4_000, 'the BNB Smart Chain archive',
      )
      const years = Number(bNow.timestamp - bThen.timestamp) / (365 * 86_400)
      const annualise = (now: bigint, before: bigint) => Number(((Number(now) / Number(before) - 1) / years * 100).toFixed(4))

      const wantBnb = ask.asset === 'BNB' || ask.asset === 'WBNB'
      const read = await within(yieldReader({ client: publicClient(), maxMarkets: 40 }), deadline, 'the Venus markets')
      if (!read.ok) return refuse(`could not read Venus markets: ${read.error}`)
      const bnbUsd = read.data.bnbPriceUsd

      const matching = read.data.venues.filter((v: YieldVenue) => {
        const s = v.underlyingSymbol.toUpperCase()
        return wantBnb ? s === 'BNB' || s === 'WBNB' : s === ask.asset
      })
      const sizeUsd = wantBnb ? ask.amount * bnbUsd : ask.amount

      const rows: Array<Record<string, unknown> & { realisedAprPct: number; netRealisedAprPct: number }> = []
      const excluded: Array<{ venue: string; reason: string }> = []

      await within(Promise.all(matching.map(async (v: YieldVenue) => {
        try {
          const [now, before] = await Promise.all([
            rateAt(archive, v.market, VTOKEN_RATE, 'exchangeRateStored', [], head),
            rateAt(archive, v.market, VTOKEN_RATE, 'exchangeRateStored', [], then),
          ])
          const realised = annualise(now, before)
          const quote = netAprAtSize(v, sizeUsd)
          const costPct = quote.costPct
          rows.push({
            venue: `Venus ${v.symbol}`,
            kind: 'lending',
            realisedAprPct: realised,
            quotedAprPct: Number(v.grossApr.value.toFixed(4)),
            quoteMinusRealisedPct: Number((v.grossApr.value - realised).toFixed(4)),
            switchingCostPct: Number(costPct.toFixed(4)),
            netRealisedAprPct: Number((realised - costPct).toFixed(4)),
            withdrawableUsd: Math.round(v.cashUsd.value),
            source: `vToken exchangeRateStored at blocks ${then} and ${head}`,
          })
        } catch (err) {
          excluded.push({ venue: `Venus ${v.symbol}`, reason: `rate unreadable at the window start: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}` })
        }
      })), deadline, 'the archived Venus rates')

      if (wantBnb) {
        // Staking is entered by a stake call, not a swap: gas only, the same
        // round-trip gas figure the Venus reader uses, stated as a share of size.
        const gasPct = sizeUsd > 0 ? ((matching[0]?.gasCostUsd.value ?? 0) / sizeUsd) * 100 : 0
        await within(Promise.all(LSTS.map(async (l) => {
          try {
            const [now, before] = await Promise.all([
              rateAt(archive, l.address, l.abi, l.fn, [ONE], head),
              rateAt(archive, l.address, l.abi, l.fn, [ONE], then),
            ])
            const realised = annualise(now, before)
            rows.push({
              venue: l.name,
              kind: 'liquid staking',
              realisedAprPct: realised,
              quotedAprPct: null,
              quoteMinusRealisedPct: null,
              switchingCostPct: Number(gasPct.toFixed(4)),
              netRealisedAprPct: Number((realised - gasPct).toFixed(4)),
              bnbPerToken: Number(now) / 1e18,
              source: `${l.fn}(1e18) on ${l.address} at blocks ${then} and ${head}`,
            })
          } catch (err) {
            excluded.push({ venue: l.name, reason: `rate unreadable: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}` })
          }
        })), deadline, 'the liquid staking rates')
        for (const e of LST_EXCLUDED) excluded.push({ venue: e.token, reason: e.reason })
      }

      if (rows.length === 0) {
        return {
          recommend: false,
          venue: null,
          declineReason: `no ${ask.asset} venue could be measured over the window`,
          excluded,
          assumptions: ask.assumptions,
          blockNumber: head.toString(),
        }
      }

      rows.sort((a, b) => b.netRealisedAprPct - a.netRealisedAprPct)
      const best = rows[0] as (typeof rows)[number]
      const recommend = best.netRealisedAprPct > 0
      return {
        recommend,
        venue: recommend ? best.venue : null,
        realisedAprPct: best.realisedAprPct,
        netRealisedAprPct: best.netRealisedAprPct,
        declineReason: recommend ? null : `no venue paid more than its switching cost at ${Math.round(sizeUsd)} USD over the window`,
        ranking: rows,
        excluded,
        window: {
          days: Number((years * 365).toFixed(2)),
          fromBlock: then.toString(),
          toBlock: head.toString(),
          fromTime: new Date(Number(bThen.timestamp) * 1000).toISOString(),
          toTime: new Date(Number(bNow.timestamp) * 1000).toISOString(),
        },
        sizeUsd: Math.round(sizeUsd * 100) / 100,
        method: 'simple annualised growth of each venue’s on-chain exchange rate between the two blocks; switching cost is one-off gas and swap cost as a share of size, taken off one year of yield',
        usesLeverage: false,
        assumptions: ask.assumptions,
        source: 'archived eth_call reads on BNB Smart Chain; quoted rates from Venus supplyRatePerBlock at head',
      }
    } catch (err) {
      return refuse(err instanceof Error ? err.message : String(err))
    }
  },
}
