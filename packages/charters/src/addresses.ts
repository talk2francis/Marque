import type { Address } from 'viem'

/**
 * Charters, per chain. Every address here was read from the chain on 8 Nov 2026 (comptroller(), underlying(),
 * decimals(), markets(), REPAY not paused) before it was written down. The factory is filled in when it is deployed,
 * with its block and the LoanGuard creation-code digest, so a guard can be matched to the reviewed source.
 */
export type CharterChainId = 56 | 97

export interface DebtMarket {
  /** The Venus vToken the guard repays into. */
  vToken: Address
  /** The token the owner's reserve is held in, and its decimals on this chain. */
  token: Address
  symbol: 'USDT' | 'USDC' | 'FDUSD'
  decimals: number
}

export interface CharterChain {
  chainId: CharterChainId
  name: string
  /** Venus Core comptroller (Diamond proxy). */
  comptroller: Address
  markets: readonly DebtMarket[]
  factory: Address | null
  /** Block the factory was deployed in; the indexer starts here. */
  factoryBlock: bigint | null
  explorer: string
}

export const CHARTER_CHAINS: Record<CharterChainId, CharterChain> = {
  56: {
    chainId: 56,
    name: 'BNB Smart Chain',
    comptroller: '0xfD36E2c2a6789Db23113685031d7F16329158384',
    markets: [
      { vToken: '0xfD5840Cd36d94D7229439859C0112a4185BC0255', token: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
      { vToken: '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8', token: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', decimals: 18 },
      { vToken: '0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba', token: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', symbol: 'FDUSD', decimals: 18 },
    ],
    factory: null,
    factoryBlock: null,
    explorer: 'https://bscscan.com',
  },
  97: {
    chainId: 97,
    name: 'BSC testnet',
    comptroller: '0x94d1820b2D1c7c7452A163983Dc888CEC546b77D',
    markets: [
      { vToken: '0xb7526572FFE56AB9D7489838Bf2E18e3323b441A', token: '0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c', symbol: 'USDT', decimals: 6 },
      { vToken: '0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7', token: '0x16227D60f7a0e586C66B005219dfc887D13C9531', symbol: 'USDC', decimals: 6 },
      { vToken: '0xF06e662a00796c122AaAE935EC4F0Be3F74f5636', token: '0xcF27439fA231af9931ee40c4f27Bb77B83826F3C', symbol: 'FDUSD', decimals: 18 },
    ],
    // Deployed 9 Nov 2026 by the testnet operator, tx 0x51f0fe5814e1affdfeca80575c4ad9d3290173f42958be8bf209f1a34a66fc96. Guards
    // check their own rules (CharterRules) and refuse a loan they cannot save. The first testnet factory,
    // 0x1D70FE00f3eFC0B7AA519B95aA459fB583B2b921, predates both and is retired: its test guards are ended.
    factory: '0xaf53e33562B8894314B65F40EB8D199525a6358d',
    factoryBlock: 141637641n,
    explorer: 'https://testnet.bscscan.com',
  },
}

export const isCharterChain = (n: number): n is CharterChainId => n === 56 || n === 97

/** The market a vToken names on this chain, or null when the guard does not support it. */
export function marketOf(chainId: CharterChainId, vToken: string): DebtMarket | null {
  const v = vToken.toLowerCase()
  return CHARTER_CHAINS[chainId].markets.find((m) => m.vToken.toLowerCase() === v) ?? null
}

/** Health values carry 18 decimals on chain: 1e18 is a health of 1.00. */
export const HEALTH_ONE = 10n ** 18n

/** The factory's bounds, mirrored for the builder's sliders; the contract enforces them. */
export const BOUNDS = {
  minTrigger: 102n * 10n ** 16n,
  maxTrigger: 10n * HEALTH_ONE,
  minGap: 5n * 10n ** 16n,
  maxTarget: 20n * HEALTH_ONE,
  minDays: 1,
  maxDays: 90,
  tipDivisor: 10n,
} as const

/**
 * Who pressed the button. An Acted caller counts for an agent only when that address is a declared executor of the
 * agent (AGENTS.md C6: earned from onchain actions, never declared capability). Keel's watcher is Marque's health
 * agent acting through Altana; the backup watcher is Marque's own fallback, never presented as an agent.
 */
export const KEEL_WATCHER: Address = '0xDaE9D20B10c95e666351e3C8Ae401D7cF193B292'
export const BACKUP_WATCHER: Address = '0xfF12C2bb6A8C4488Dc1159Bc0dBE8A1DcEfBc1B7'

/** Agent identity (chainId:registry:tokenId, as the Register keys agents) to its declared executor addresses. */
export const DECLARED_EXECUTORS: Record<string, readonly Address[]> = {
  '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:341556': [KEEL_WATCHER], // Keel, BSC mainnet
  '97:0x8004a818bfb912233c491871b3d84c89a494bd9e:2238': [KEEL_WATCHER], // Keel, BSC testnet
}

export type CallerKind = 'keel' | 'backup' | 'owner' | 'agent'

/** How a caller is named on a charter page. */
export function callerKind(caller: string, owner: string): CallerKind {
  const c = caller.toLowerCase()
  if (c === owner.toLowerCase()) return 'owner'
  if (c === KEEL_WATCHER.toLowerCase()) return 'keel'
  if (c === BACKUP_WATCHER.toLowerCase()) return 'backup'
  return 'agent'
}
