import type { Address } from 'viem'
import type { CharterChainId } from './addresses.js'

/**
 * Charters v2: four kinds on a shared base (AGENTS.md section 14). Every address here was read from the chain when
 * it was deployed; factories are null until deployed on that chain. Testnet grid and range pools are Marque's
 * labelled fixtures (C11): anything built on them says so wherever it appears.
 */
export type CharterKind = 'loan' | 'yield' | 'grid' | 'range'
export const KIND_CODES = { loan: 1, yield: 2, grid: 3, range: 4 } as const
export const KIND_BY_CODE: Record<number, CharterKind> = { 1: 'loan', 2: 'yield', 3: 'grid', 4: 'range' }
export const KIND_NAMES: Record<CharterKind, string> = { loan: 'Loan Guard', yield: 'Yield Sweep', grid: 'Grid Band', range: 'Range Keeper' }
/** Open kinds: anyone may call act(). Named kinds: only the owner and the executors the owner set (C7). */
export const OPEN_KINDS: ReadonlySet<CharterKind> = new Set(['loan', 'yield'])

export type ReferenceAgent = 'keel' | 'sluicegate' | 'lattice' | 'bound'
export const AGENT_FOR_KIND: Record<CharterKind, ReferenceAgent> = { loan: 'keel', yield: 'sluicegate', grid: 'lattice', range: 'bound' }

/** Public executor addresses of Marque's reference agents (the same on both chains), declared in their agent cards. */
export const EXECUTORS: Record<ReferenceAgent | 'backup', Address> = {
  keel: '0xDaE9D20B10c95e666351e3C8Ae401D7cF193B292',
  sluicegate: '0xbe527145766262800dABd795aDE6063a85D5F31e',
  lattice: '0xe05eb57da6d52eDA9dbb396c323055046B29bd43',
  bound: '0x03d8adB84E30fAd68144331A5cBdCC99a0ec316b',
  backup: '0xfF12C2bb6A8C4488Dc1159Bc0dBE8A1DcEfBc1B7',
}

export interface ReviewedPool {
  address: Address
  /** The token the grid buys and sells, and the one it pays with. */
  base: Address
  quote: Address
  baseSymbol: string
  quoteSymbol: string
  fee: number
  /** True on testnet: a Marque fixture pool whose price Marque's test market maker moves. */
  fixture: boolean
}

export interface V2Chain {
  loanFactory: Address | null
  yieldFactory: Address | null
  gridFactory: Address | null
  rangeFactory: Address | null
  rangeBlueprint: Address | null
  blueprintCodeHash: `0x${string}` | null
  /** All four factories were deployed from one script run; the indexer starts at the first block. */
  fromBlock: bigint | null
  npm: Address
  pcsFactory: Address
  pools: readonly ReviewedPool[]
}

export const V2: Record<CharterChainId, V2Chain> = {
  56: {
    // Deployed 9 Nov 2026 from 0x5766...35C7 (blocks 132642035 to 132642053), source as reviewed (fork suites green at 132640832).
    loanFactory: '0x60bB1B002c1469DF778Ff1e49F2e5e43cde9eA7d',
    yieldFactory: '0xb32a26c068d5C650e6C17F390b5c2a72A1968d03',
    gridFactory: '0x2267640b997dc00139d46cC6A94a89822D43F0a5',
    rangeFactory: '0x374b739439FE25E12B8664EB9231a13EaEC138F4',
    rangeBlueprint: '0x81bC7F48c854b6D1117556EA9d1C1306F26d6f19',
    blueprintCodeHash: '0xf80350b91a38fd580c1ac1ad3cb8240d36abee72d64d1b7410f8cd9c2ee256c5',
    fromBlock: 132642035n,
    npm: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    pcsFactory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    // Reviewed 9 Nov 2026: deepest pools with at least an hour of observations (PROJECT_STATE, Q1).
    pools: [
      { address: '0x172fcD41E0913e95784454622d1c3724f546f849', base: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', quote: '0x55d398326f99059fF775485246999027B3197955', baseSymbol: 'WBNB', quoteSymbol: 'USDT', fee: 100, fixture: false },
      { address: '0x36696169C63e42cd08ce11f5deeBbCeBae652050', base: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', quote: '0x55d398326f99059fF775485246999027B3197955', baseSymbol: 'WBNB', quoteSymbol: 'USDT', fee: 500, fixture: false },
      { address: '0xf2688Fb5B81049DFB7703aDa5e770543770612C4', base: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', quote: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', baseSymbol: 'WBNB', quoteSymbol: 'USDC', fee: 100, fixture: false },
      { address: '0x46Cf1cF8c69595804ba91dFdd8d6b960c9B0a7C4', base: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', quote: '0x55d398326f99059fF775485246999027B3197955', baseSymbol: 'BTCB', quoteSymbol: 'USDT', fee: 500, fixture: false },
    ],
  },
  97: {
    loanFactory: '0x63F9040AA802c1259B59A6AEc0a8856287684748',
    yieldFactory: '0xd46c7D475fbA434e3A00D3f92feA25E56f55B012',
    gridFactory: '0x5F89CF9a3fb4fb98C620b6aA796554f171030CC4',
    rangeFactory: '0xB5F9c7B3A872D5DbbCEBc6049Ab7254140b6168B',
    rangeBlueprint: '0x21F4B4722b7faadFA91D69F91E0C03055945C198',
    blueprintCodeHash: '0xf80350b91a38fd580c1ac1ad3cb8240d36abee72d64d1b7410f8cd9c2ee256c5',
    fromBlock: 141741561n,
    npm: '0x427bF5b37357632377eCbEC9de3626C71A5396c1',
    pcsFactory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    pools: [
      { address: '0xf586f9B80d0c0b3b13245419a9634364FBAe1FD7', base: '0x60bB1B002c1469DF778Ff1e49F2e5e43cde9eA7d', quote: '0x07c4e07173139F05c05511052c8721517e31F524', baseSymbol: 'tWBNB', quoteSymbol: 'tUSDT', fee: 500, fixture: true },
    ],
  },
}

export function factoryFor(chainId: CharterChainId, kind: CharterKind): Address | null {
  const c = V2[chainId]
  return { loan: c.loanFactory, yield: c.yieldFactory, grid: c.gridFactory, range: c.rangeFactory }[kind]
}

/** preview() state codes per kind, in the contracts' own order. Only the would-act states ever send. */
export const STATES: Record<CharterKind, readonly string[]> = {
  loan: ['watching', 'would_act', 'ended', 'expired', 'no_debt', 'no_funds', 'below_minimum'],
  yield: ['in_band', 'would_supply', 'would_withdraw', 'ended', 'expired', 'collateral_hold', 'cap_reached', 'liquidity_short', 'nothing_held', 'health_limit'],
  grid: ['idle', 'would_buy', 'would_sell', 'ended', 'expired', 'unsettled', 'no_funds'],
  range: ['in_range', 'would_move', 'ended', 'expired', 'unsettled', 'too_soon', 'limit_reached', 'not_held'],
}
export const WOULD_ACT: Record<CharterKind, ReadonlySet<number>> = {
  loan: new Set([1]),
  yield: new Set([1, 2]),
  grid: new Set([1, 2]),
  range: new Set([1]),
}
export const stateName = (kind: CharterKind, code: number) => STATES[kind][code] ?? 'unknown'

/** The worker's read cadence per kind and chain, in milliseconds (10_WORKER_AND_BACKEND.md). */
export const CADENCE_MS: Record<CharterKind, Record<CharterChainId, number>> = {
  loan: { 56: 20_000, 97: 30_000 },
  yield: { 56: 60_000, 97: 60_000 },
  grid: { 56: 30_000, 97: 30_000 },
  range: { 56: 60_000, 97: 60_000 },
}
