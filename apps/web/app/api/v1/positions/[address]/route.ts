import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { pancakeV3Reader, venusReader, spotReader, yieldReader, netAprAtSize } from '@marque/positions'
import { publicClient } from '@marque/chain'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

/**
 * Live positions for any BSC address.
 *
 * No wallet, no signature, no account — pasting an address is the whole
 * interface (AGENTS.md invariant 2). A judge with no wallet installed must be
 * able to complete this journey, so this endpoint is deliberately public and
 * deliberately GET.
 *
 * Every reader is run against the SAME block, so the four position types on
 * screen are consistent with each other. Reading each at "latest" would let
 * them drift a block apart, which is invisible and wrong.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params

  if (!isAddress(address)) {
    return NextResponse.json(
      { error: 'bad_address', detail: 'Not a valid BNB Smart Chain address.' },
      { status: 400 },
    )
  }

  const startedAt = Date.now()
  try {
    const blockNumber = await publicClient().getBlockNumber()

    // Settled, not all — one failing reader must not blank the whole Desk.
    const [v3, venus, spot, yields] = await Promise.allSettled([
      pancakeV3Reader(address, { blockNumber }),
      venusReader(address, { blockNumber }),
      spotReader(address, { blockNumber }),
      yieldReader({ blockNumber, maxMarkets: 24 }),
    ])

    const unwrap = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null)

    const v3r = unwrap(v3)
    const venusR = unwrap(venus)
    const spotR = unwrap(spot)
    const yieldR = unwrap(yields)

    const positions = v3r?.ok ? v3r.data.positions : []
    const venusData = venusR?.ok ? venusR.data : null
    const spotData = spotR?.ok ? spotR.data : null

    // The best net APR at the size actually held idle. Absent when we cannot
    // price the holding — never defaulted to a flattering number.
    let bestYield: { protocol: string; asset: string; netAprPct: number; grossAprPct: number; breakEvenUsd: number } | null = null
    const idleUsd = spotData?.balances
      .filter((b) => b.symbol === 'USDT' || b.symbol === 'USDC')
      .reduce((s, b) => s + (b.valueUsd?.value ?? 0), 0) ?? 0

    if (yieldR?.ok && idleUsd > 0) {
      const best = yieldR.data.venues[0]
      if (best) {
        const q = netAprAtSize(best, Math.max(idleUsd, 1))
        bestYield = {
          protocol: best.protocol,
          asset: best.underlyingSymbol,
          netAprPct: q.netAprPct,
          grossAprPct: q.grossAprPct,
          breakEvenUsd: q.breakEvenUsd,
        }
      }
    }

    return NextResponse.json({
      address,
      chainId: 56,
      blockNumber: blockNumber.toString(),
      readAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      provenance: 'ONCHAIN',

      pancakeV3: {
        ok: v3r?.ok ?? false,
        error: v3r && !v3r.ok ? v3r.error : null,
        emptyPositions: v3r?.ok ? v3r.data.emptyPositions : 0,
        positions: positions.map((p) => ({
          tokenId: p.tokenId,
          pair: `${p.token0.symbol}/${p.token1.symbol}`,
          fee: p.fee,
          tickSpacing: p.tickSpacing,
          pool: p.pool,
          inRange: p.inRange.value === 1,
          tickLower: p.tickLower,
          tickUpper: p.tickUpper,
          tickCurrent: p.tickCurrent,
          priceLower: p.priceLower.value,
          priceUpper: p.priceUpper.value,
          priceCurrent: p.priceCurrent.value,
          priceUnit: p.priceCurrent.unit,
          pctToLower: p.pctToLower.value,
          pctToUpper: p.pctToUpper.value,
          rangePosition: p.rangePosition.value,
          amount0: p.amount0.value,
          amount1: p.amount1.value,
          token0: p.token0.symbol,
          token1: p.token1.symbol,
          fees0: p.fees0.value,
          fees1: p.fees1.value,
        })),
      },

      venus: {
        ok: venusR?.ok ?? false,
        error: venusR && !venusR.ok ? venusR.error : null,
        hasPosition: venusData?.hasPosition ?? false,
        healthFactor: venusData?.healthFactor?.value ?? null,
        weightedCollateralUsd: venusData?.weightedCollateralUsd.value ?? 0,
        totalBorrowedUsd: venusData?.totalBorrowedUsd.value ?? 0,
        markets: (venusData?.markets ?? [])
          .filter((m) => m.supplied > 0 || m.borrowed > 0)
          .map((m) => ({
            symbol: m.underlyingSymbol,
            collateralFactor: m.collateralFactor,
            priceUsd: m.priceUsd,
            suppliedUsd: m.suppliedUsd,
            borrowedUsd: m.borrowedUsd,
            liquidationPriceUsd: m.liquidationPriceUsd,
            pctDropToLiquidation: m.pctDropToLiquidation,
          })),
      },

      spot: {
        ok: spotR?.ok ?? false,
        totalValueUsd: spotData?.totalValueUsd.value ?? 0,
        pricedCount: spotData?.pricedCount ?? 0,
        unpricedCount: spotData?.unpricedCount ?? 0,
        idleStableUsd: idleUsd,
        balances: (spotData?.balances ?? []).map((b) => ({
          symbol: b.symbol,
          amount: b.amount.value,
          priceUsd: b.priceUsd?.value ?? null,
          valueUsd: b.valueUsd?.value ?? null,
        })),
      },

      bestYield,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'read_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
