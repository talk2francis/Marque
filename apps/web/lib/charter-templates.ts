/**
 * Charter templates — what a charter for each category actually permits.
 *
 * Every address below is on BSC TESTNET (97) and was verified by calling the
 * contract, not by trusting an address list:
 *
 *   NonfungiblePositionManager  factory() -> 0x0BFb…1865, symbol() -> "PCS-V3-POS"
 *   SwapRouter                  deployer() -> 0x41ff…71c9 (the V3 deployer)
 *   Venus Comptroller           getAllMarkets() returns the testnet market set
 *   vUSDT                       symbol() -> "vUSDT", comptroller() -> the above
 *
 * Charters are granted on TESTNET. A mainnet charter grant is escalation gate 1
 * and requires written approval, which a config flag is not.
 *
 * The copy here is the user-facing contract. AGENTS.md invariant 14: no screen
 * may need a glossary, so nothing on the Charter Desk says "session key",
 * "policy", "selector" or "allowlist". It says what the agent may do and what
 * it may not.
 */

import { explorerAddress, explorerTx } from './network'

export type CharterCategory = 'rebalancing' | 'grid' | 'yield' | 'health_factor'

export interface TemplateCall {
  to: `0x${string}`
  /** What the contract is, in words a reader can check on BscScan. */
  contract: string
  /** Selectors permitted. Never empty — an empty list permits every function. */
  selectors: string[]
  /** What those functions let the agent do, in plain language. */
  may: string[]
}

export interface CharterTemplate {
  category: CharterCategory
  name: string
  /** One line naming the job this charter exists to allow. */
  purpose: string
  calls: TemplateCall[]
  /** Things this charter explicitly does not permit. Concrete, not reassuring. */
  mayNot: string[]
  /** Default cap in BNB, as a decimal string the UI renders and the user edits. */
  defaultCapBnb: string
  /** Default life of the charter, in minutes. */
  defaultMinutes: number
}

const NFPM = '0x427bF5b37357632377eCbEC9de3626C71A5396c1' as const
const SWAP_ROUTER = '0x9a489505a00cE272eAa5e07Dba6491314CaE3796' as const
const COMPTROLLER = '0x94d1820b2D1c7c7452A163983Dc888CEC546b77D' as const
const VUSDT = '0xb7526572FFE56AB9D7489838Bf2E18e3323b441A' as const

/**
 * Bounds that are true of EVERY charter, because they come from the mechanism
 * rather than from the template. Listed on every charter so the reader sees the
 * same four guarantees each time and learns to expect them.
 */
export const UNIVERSAL_MAY_NOT: string[] = [
  'Send your funds to any address of its own choosing.',
  'Call any contract that is not named on this charter.',
  'Act at all after the expiry below, or after you revoke.',
  'Spend more than the cap below, whatever it asks for.',
]

export const TEMPLATES: Record<CharterCategory, CharterTemplate> = {
  rebalancing: {
    category: 'rebalancing',
    name: 'Re-centre a liquidity range',
    purpose: 'Let an agent move a PancakeSwap V3 position back around the current price.',
    calls: [
      {
        to: NFPM,
        contract: 'PancakeSwap V3 position manager',
        selectors: ['0x0c49ccbe', '0xfc6f7865', '0x88316456'],
        may: [
          'Withdraw liquidity from your existing range.',
          'Collect the fees that range has earned.',
          'Open a new range around the current price.',
        ],
      },
      {
        to: SWAP_ROUTER,
        contract: 'PancakeSwap V3 router',
        selectors: ['0x414bf389'],
        may: ['Swap between the two tokens of that pair, to balance the new range.'],
      },
    ],
    mayNot: [
      'Open a position in a pair you do not already hold.',
      'Change the fee tier of your position.',
    ],
    defaultCapBnb: '0.01',
    defaultMinutes: 60,
  },

  grid: {
    category: 'grid',
    name: 'Place a bounded grid',
    purpose: 'Let an agent buy and sell one pair inside the price band you set.',
    calls: [
      {
        to: SWAP_ROUTER,
        contract: 'PancakeSwap V3 router',
        selectors: ['0x414bf389', '0xdb3e2198'],
        may: ['Swap between the two tokens of one pair, in both directions.'],
      },
    ],
    mayNot: [
      'Trade any pair other than the one you name.',
      'Add or remove liquidity anywhere.',
    ],
    defaultCapBnb: '0.005',
    defaultMinutes: 120,
  },

  yield: {
    category: 'yield',
    name: 'Move a stablecoin position',
    purpose: 'Let an agent move your stablecoins to the venue paying more at your size.',
    calls: [
      {
        to: VUSDT,
        contract: 'Venus vUSDT market',
        selectors: ['0xa0712d68', '0x852a12e3'],
        may: ['Supply USDT to the market.', 'Withdraw USDT from the market.'],
      },
      {
        to: COMPTROLLER,
        contract: 'Venus Comptroller',
        selectors: ['0xc2998238'],
        may: ['Enter the market, which is required before supplying.'],
      },
    ],
    mayNot: [
      'Borrow against your position.',
      'Use leverage of any kind.',
      'Move funds to a venue outside the list you approved.',
    ],
    defaultCapBnb: '0.005',
    defaultMinutes: 60,
  },

  health_factor: {
    category: 'health_factor',
    name: 'Restore a health factor',
    purpose: 'Let an agent repay part of your loan to pull you away from liquidation.',
    calls: [
      {
        to: VUSDT,
        contract: 'Venus vUSDT market',
        selectors: ['0x0e752702'],
        may: ['Repay part of your USDT borrow.'],
      },
    ],
    mayNot: [
      'Borrow more on your behalf.',
      'Withdraw your collateral.',
      'Repay more than the cap below, even if that leaves you short of the target.',
    ],
    defaultCapBnb: '0.002',
    defaultMinutes: 30,
  },
}

export const CATEGORY_ORDER: CharterCategory[] = ['rebalancing', 'grid', 'yield', 'health_factor']

export function isCharterCategory(value: string): value is CharterCategory {
  return (CATEGORY_ORDER as string[]).includes(value)
}

/**
 * Explorer links for charter surfaces. Charters are on BSC testnet (97), so
 * these resolve through the one network resolver at that chain id rather than
 * hardcoding a host (P10.5A item 2).
 */
export function scanAddress(address: string): string {
  return explorerAddress(97, address)
}

export function scanTx(hash: string): string {
  return explorerTx(97, hash)
}
