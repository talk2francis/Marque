/**
 * Two networks, two lanes, never blended (AGENTS invariant 32).
 *
 *   mainnet   BSC mainnet (56): the default, and the only real-money network.
 *   practice  BSC testnet (97): a labelled, separate practice lane with test tokens.
 *
 * An agent's lane is the chain of its ERC-8004 registration, and a quote counts only on
 * that same chain: an identity registered on testnet that prices a mainnet job (or the
 * reverse) is hireable in neither lane. Every count names its lane; no total adds the two.
 * Browser-safe.
 */
export type Lane = 'mainnet' | 'practice'
export const LANES: readonly Lane[] = ['mainnet', 'practice']
export const LANE_CHAIN = { mainnet: 56, practice: 97 } as const satisfies Record<Lane, 56 | 97>
export type LaneChain = (typeof LANE_CHAIN)[Lane]

export function laneOf(chainId: number | null | undefined): Lane | null {
  return chainId === 56 ? 'mainnet' : chainId === 97 ? 'practice' : null
}

export function chainOf(lane: Lane): LaneChain {
  return LANE_CHAIN[lane]
}

/** Parse a lane from a URL value: `practice`, `testnet` and `97` mean the practice lane; anything else is mainnet. */
export function parseLane(v: string | null | undefined): Lane {
  const s = (v ?? '').trim().toLowerCase()
  return s === 'practice' || s === 'testnet' || s === '97' ? 'practice' : 'mainnet'
}

/** The label a lane carries wherever a number or price from it is shown. */
export const LANE_LABEL: Record<Lane, { short: string; long: string; network: string }> = {
  mainnet: { short: 'Mainnet', long: 'Mainnet · real money', network: 'BSC mainnet' },
  practice: { short: 'Practice', long: 'Practice · BSC testnet, free', network: 'BSC testnet' },
}

/** True when a quote may count in the lane of an agent registered on `registryChainId`. */
export function quoteInLane(registryChainId: number, quoteChainId: number | null | undefined): boolean {
  return quoteChainId === registryChainId && laneOf(registryChainId) !== null
}
