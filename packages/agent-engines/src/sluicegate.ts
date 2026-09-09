import { yieldReader, netAprAtSize } from '@marque/positions'
import { publicClient } from '@marque/chain'
import { listAfter, num } from './parse.js'
import { historicalContext, isRefusal } from './historical.js'
import { refuse, within, type Engine, type EngineAnswer, type EngineMeta } from './types.js'

/**
 * Sluicegate — yield optimisation.
 *
 * A headline APR is not what you earn. At the buyer's size, after gas and swap
 * costs, the best-looking venue is often the worse one — the same $1.40 of gas
 * is 0.14% of $1,000 and 14% of $10. So every rate this agent quotes is NET at
 * the stated size, itemized into the three costs that behave differently with
 * size, and carries a source and a timestamp.
 *
 * The behaviour that matters most is DECLINING. When nothing beats what the
 * buyer already earns by the margin they set, the correct answer is
 * `recommend: false`, stated explicitly. An agent that always finds something
 * to recommend is not an optimiser, it is a salesman — and silence is not a
 * decline either: an empty answer has failed to answer.
 *
 * Two live-data traps this engine inherits from the reader and must never
 * paper over: BSC blocks are 0.45s, not 3s, so a per-block rate compounded on
 * the Compound constant understates every APR by 6.7×; and Venus lists a dead
 * market reporting 1.05e14 % APR, which becomes the headline number unless the
 * credibility guard drops it. The reader handles both and publishes what it
 * excluded.
 */

export const SLUICEGATE_META: EngineMeta = {
  id: 'sluicegate',
  name: 'Sluicegate',
  category: 'yield',
  testId: 'MCS-YIELD-1',
  description:
    'Routes idle stablecoins on BNB Smart Chain by NET APR at your size — gross rate minus gas, swap and exit costs — with every rate sourced and timestamped, and an explicit decline when nothing beats what you already earn. Non-custodial: it computes, it never signs.',
  priceUsd: 0.10,
  skills: [
    {
      id: 'net-apr-at-size',
      name: 'Net APR at a stated size',
      description: 'Gross rate minus itemized switching costs, at the size actually being deployed.',
      tags: ['yield', 'apr', 'venus', 'lending'],
    },
    {
      id: 'route-or-decline',
      name: 'Route, or decline explicitly',
      description: 'Recommends a venue only when it clears the supplied improvement threshold, and says so when nothing does.',
      tags: ['yield', 'routing', 'threshold'],
    },
  ],
}

interface YieldAsk {
  asset: string
  sizeUsd: number
  allowedProtocols: string[]
  minImprovementBps: number
  leverageAllowed: boolean
  currentAprPct: number
}

function parseAsk(prompt: string): YieldAsk | { missing: string[] } {
  const sizeUsd = num(prompt, String.raw`size\s+%N%\s*USD`, String.raw`%N%\s*USD of`, String.raw`for\s+%N%\s*USD`)
  const minImprovementBps = num(
    prompt,
    String.raw`minimum improvement\s+%N%\s*bps`,
    String.raw`at least\s+%N%\s*bps`,
    String.raw`%N%\s*bps`,
  )
  const currentAprPct = num(
    prompt,
    String.raw`currently earning\s+%N%\s*%`,
    String.raw`current\s+%N%\s*%`,
    String.raw`beating the current\s+%N%\s*%`,
  )
  const assetMatch = prompt.match(/asset\s+([A-Za-z0-9]{2,12})/i)
    ?? prompt.match(/USD of\s+([A-Za-z0-9]{2,12})/i)
    ?? prompt.match(/\bfor\s+[\d.]+\s+USD of\s+([A-Za-z0-9]{2,12})/i)
  const allowed = listAfter(prompt, 'allowed protocols') ?? listAfter(prompt, 'only')

  const missing: string[] = []
  if (!assetMatch?.[1]) missing.push('the asset')
  if (sizeUsd === null) missing.push('the size in USD')
  if (!allowed || allowed.length === 0) missing.push('the allowed protocols')
  if (minImprovementBps === null) missing.push('the minimum improvement in bps')
  if (currentAprPct === null) missing.push('the APR currently earned')
  if (missing.length > 0) return { missing }

  return {
    asset: (assetMatch as RegExpMatchArray)[1] as string,
    sizeUsd: sizeUsd as number,
    allowedProtocols: allowed as string[],
    minImprovementBps: minImprovementBps as number,
    // Absence is NOT permission. A prompt silent on leverage is read as
    // excluding it, which is the direction that cannot hurt the buyer.
    leverageAllowed: /leverage\s+allowed/i.test(prompt) && !/NOT allowed/i.test(prompt),
    currentAprPct: currentAprPct as number,
  }
}

export const sluicegateEngine: Engine = {
  meta: SLUICEGATE_META,
  async run(prompt, opts = {}): Promise<EngineAnswer> {
    const deadline = opts.deadlineMs ?? 7_000
    const ask = parseAsk(prompt)
    if ('missing' in ask) {
      return refuse(
        `the task does not state ${ask.missing.join(', ')}`,
        'net APR is size-dependent and the threshold is the buyer’s to set, so neither can be assumed',
      )
    }

    try {
      const head = await within(publicClient().getBlockNumber(), 3_000, 'BNB Smart Chain')
      const ctx = historicalContext(prompt, head)
      if (isRefusal(ctx)) return ctx
      const { client, readAt } = ctx
      const read = await within(
        yieldReader({ client, ...(readAt === undefined ? {} : { blockNumber: readAt }), maxMarkets: 30 }),
        deadline,
        'the Venus markets',
      )
      if (!read.ok) return refuse(`could not read yield venues: ${read.error}`)

      const allowed = new Set(ask.allowedProtocols.map((s) => s.toLowerCase()))
      const candidates = read.data.venues
        .filter((v) => allowed.has(v.protocol.toLowerCase()))
        .filter((v) => v.underlyingSymbol.toLowerCase() === ask.asset.toLowerCase())
        .map((v) => ({ venue: v, quote: netAprAtSize(v, ask.sizeUsd) }))
        .sort((a, b) => b.quote.netAprPct - a.quote.netAprPct)

      const readAtIso = read.readAt
      if (candidates.length === 0) {
        // Declining because there is nothing to compare is a different fact
        // from declining because nothing was good enough, and the buyer needs
        // to be able to tell them apart.
        return {
          recommend: false,
          venue: null,
          netAprPct: null,
          aprSources: [],
          switchingCost: { gasUsd: 0, swapUsd: 0, exitUsd: 0 },
          usesLeverage: false,
          declineReason: `no ${ask.asset} market on ${ask.allowedProtocols.join(', ')} could be priced at block ${read.blockNumber}`,
          excluded: read.data.excluded.map((e) => ({ symbol: e.underlyingSymbol, reason: e.reason, detail: e.detail })),
          blockNumber: read.blockNumber.toString(),
        }
      }

      const best = candidates[0] as (typeof candidates)[number]
      const improvementBps = (best.quote.netAprPct - ask.currentAprPct) * 100
      const clears = improvementBps >= ask.minImprovementBps

      const swapUsd = ask.sizeUsd * (best.venue.swapCostBps.value / 10_000)
      const gasUsd = best.venue.gasCostUsd.value

      return {
        // Explicit, always. Silence is not a decision.
        recommend: clears,
        venue: clears ? best.venue.protocol : null,
        netAprPct: best.quote.netAprPct,
        aprSources: [
          {
            value: best.venue.grossApr.value,
            source: `Venus ${best.venue.symbol} supplyRatePerBlock at block ${read.blockNumber}, compounded over ${read.data.blocksPerYear} blocks/year`,
            timestamp: readAtIso,
          },
          {
            value: best.venue.incentiveApr.value,
            source: 'token incentives; zero until an incentive source is wired in, and reported as zero rather than omitted',
            timestamp: readAtIso,
          },
        ],
        // Itemized, because a lump sum hides which cost dominates at this size.
        switchingCost: {
          gasUsd: Number(gasUsd.toFixed(4)),
          swapUsd: Number(swapUsd.toFixed(4)),
          // Exit is the second leg of the same round trip: the reader's gas
          // figure already covers enter and exit, so attributing it twice
          // would overstate the cost. Stated as zero, not omitted.
          exitUsd: 0,
        },
        // Stated explicitly whether or not the case excludes leverage: a looped
        // position presented as a plain deposit misstates the risk.
        usesLeverage: false,
        improvementBps: Number(improvementBps.toFixed(2)),
        thresholdBps: ask.minImprovementBps,
        declineReason: clears
          ? null
          : `the best available net APR of ${best.quote.netAprPct.toFixed(4)}% beats the current ${ask.currentAprPct}% by ${improvementBps.toFixed(1)} bps, short of the ${ask.minImprovementBps} bps threshold`,
        breakEvenUsd: best.quote.breakEvenUsd,
        grossAprPct: best.venue.grossApr.value,
        sizeUsd: ask.sizeUsd,
        alternatives: candidates.slice(1, 4).map((c) => ({
          venue: c.venue.protocol,
          market: c.venue.symbol,
          netAprPct: c.quote.netAprPct,
        })),
        excluded: read.data.excluded.map((e) => ({ symbol: e.underlyingSymbol, reason: e.reason, detail: e.detail })),
        blockNumber: read.blockNumber.toString(),
        readAt: readAtIso,
        source: 'Venus Comptroller and vToken rate reads, on-chain',
      }
    } catch (err) {
      return refuse(err instanceof Error ? err.message : String(err))
    }
  },
}
