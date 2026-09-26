import { SDK_NETWORKS } from './generated.js'

/**
 * Networks, contracts and payment assets, from the pinned SDK snapshot (generated.ts).
 * Nothing here is typed by hand. Safe to import from browser code.
 */
export type ChainId = 56 | 97
export const SUPPORTED_CHAINS: readonly ChainId[] = [56, 97]

export interface Asset {
  symbol: string
  address: `0x${string}`
  decimals: number
  isDefault: boolean
}

export interface CommerceNetwork {
  key: string
  chainId: ChainId
  name: string
  explorer: string
  identityRegistry: `0x${string}`
  commerce: `0x${string}`
  router: `0x${string}`
  policy: `0x${string}`
  kernelToken: `0x${string}`
  assets: readonly Asset[]
}

const LABEL: Record<ChainId, { name: string; explorer: string }> = {
  56: { name: 'BSC mainnet', explorer: 'https://bscscan.com' },
  97: { name: 'BSC testnet', explorer: 'https://testnet.bscscan.com' },
}

export const NETWORKS: Readonly<Record<ChainId, CommerceNetwork>> = Object.fromEntries(
  SDK_NETWORKS.map((n) => [
    n.chainId,
    {
      key: n.key,
      chainId: n.chainId as ChainId,
      ...LABEL[n.chainId as ChainId],
      identityRegistry: n.identityRegistry as `0x${string}`,
      commerce: n.commerce as `0x${string}`,
      router: n.router as `0x${string}`,
      policy: n.policy as `0x${string}`,
      kernelToken: n.kernelToken as `0x${string}`,
      assets: n.assets.map((a) => ({ ...a, address: a.address as `0x${string}` })),
    },
  ]),
) as unknown as Record<ChainId, CommerceNetwork>

export function isSupportedChain(id: unknown): id is ChainId {
  return id === 56 || id === 97
}

export function network(chainId: number): CommerceNetwork {
  if (!isSupportedChain(chainId)) throw new Error(`unsupported chain ${chainId}`)
  return NETWORKS[chainId]
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The catalog asset at this address on this chain, or null if it is not in the SDK catalog. */
export function assetAt(chainId: number, address: string): Asset | null {
  if (!isSupportedChain(chainId)) return null
  return NETWORKS[chainId].assets.find((a) => same(a.address, address)) ?? null
}

export function assetBySymbol(chainId: number, symbol: string): Asset | null {
  if (!isSupportedChain(chainId)) return null
  return NETWORKS[chainId].assets.find((a) => a.symbol === symbol) ?? null
}

/** The chain Marque's campaign runs on (header pill, default hire network). */
export function campaignChainId(): ChainId {
  const raw = Number(process.env.NEXT_PUBLIC_MARQUE_CAMPAIGN_CHAIN ?? process.env.MARQUE_CAMPAIGN_CHAIN ?? 56)
  return isSupportedChain(raw) ? raw : 56
}

export function explorerTx(chainId: number, hash: string): string {
  return `${network(chainId).explorer}/tx/${hash}`
}

export function explorerAddress(chainId: number, address: string): string {
  return `${network(chainId).explorer}/address/${address}`
}

/** Format a raw token amount for people: truncates to `maxDp`, trims trailing zeros, and says "<0.000001" rather than show a nonzero amount as 0. */
export function formatAmount(raw: bigint | string, decimals: number, maxDp = 6): string {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw)
  const neg = v < 0n
  const abs = neg ? -v : v
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxDp).replace(/0+$/, '')
  if (!frac && whole === 0n && abs !== 0n) return `${neg ? '-' : ''}<0.${'0'.repeat(maxDp - 1)}1`
  return `${neg ? '-' : ''}${whole.toString()}${frac ? `.${frac}` : ''}`
}
