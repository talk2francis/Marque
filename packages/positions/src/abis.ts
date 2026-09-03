/**
 * Minimal ABIs for the contracts we read.
 *
 * Deliberately hand-trimmed to the functions actually called: a full ABI here
 * would be thousands of lines of noise and would hide which surface we depend
 * on. Addresses are BSC mainnet (chain 56) and were verified live before use.
 */
import type { Address } from 'viem'

export const BSC_ADDRESSES = {
  pancakeV3PositionManager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
  pancakeV3Factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  pancakeV3SmartRouter: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
  venusComptroller: '0xfD36E2c2a6789Db23113685031d7F16329158384',
  venusOracle: '0x6592b5DE802159F3E74B2486b091D11a8256ab8A',
  wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  usdt: '0x55d398326f99059fF775485246999027B3197955',
  usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  cake: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
} as const satisfies Record<string, Address>

export const erc20MetaAbi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }],
  },
] as const

export const nonfungiblePositionManagerAbi = [
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'tokenOfOwnerByIndex', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'ownerOf', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }],
  },
  {
    type: 'function', name: 'positions', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
  },
  {
    // Static-called (never sent) to read real uncollected fees, which
    // tokensOwed alone understates until a poke.
    type: 'function', name: 'collect', stateMutability: 'payable',
    inputs: [{
      name: 'params', type: 'tuple',
      components: [
        { name: 'tokenId', type: 'uint256' },
        { name: 'recipient', type: 'address' },
        { name: 'amount0Max', type: 'uint128' },
        { name: 'amount1Max', type: 'uint128' },
      ],
    }],
    outputs: [{ name: 'amount0', type: 'uint256' }, { name: 'amount1', type: 'uint256' }],
  },
] as const

export const pancakeV3FactoryAbi = [
  {
    type: 'function', name: 'getPool', stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    outputs: [{ type: 'address' }],
  },
] as const

export const pancakeV3PoolAbi = [
  {
    type: 'function', name: 'slot0', stateMutability: 'view', inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint32' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
  { type: 'function', name: 'liquidity', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint128' }] },
  { type: 'function', name: 'tickSpacing', stateMutability: 'view', inputs: [], outputs: [{ type: 'int24' }] },
  { type: 'function', name: 'fee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint24' }] },
] as const

export const venusComptrollerAbi = [
  {
    type: 'function', name: 'getAssetsIn', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'address[]' }],
  },
  {
    type: 'function', name: 'markets', stateMutability: 'view',
    inputs: [{ name: 'vToken', type: 'address' }],
    outputs: [
      { name: 'isListed', type: 'bool' },
      { name: 'collateralFactorMantissa', type: 'uint256' },
      { name: 'isVenus', type: 'bool' },
    ],
  },
  {
    type: 'function', name: 'getAccountLiquidity', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'error', type: 'uint256' }, { name: 'liquidity', type: 'uint256' }, { name: 'shortfall', type: 'uint256' }],
  },
  {
    type: 'function', name: 'oracle', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }],
  },
  {
    type: 'function', name: 'getAllMarkets', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }],
  },
  {
    type: 'function', name: 'closeFactorMantissa', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }],
  },
] as const

export const vTokenAbi = [
  {
    type: 'function', name: 'getAccountSnapshot', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'error', type: 'uint256' },
      { name: 'vTokenBalance', type: 'uint256' },
      { name: 'borrowBalance', type: 'uint256' },
      { name: 'exchangeRateMantissa', type: 'uint256' },
    ],
  },
  { type: 'function', name: 'underlying', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'supplyRatePerBlock', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'borrowRatePerBlock', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getCash', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalBorrows', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

export const venusOracleAbi = [
  {
    // Price is scaled to 1e(36 - underlyingDecimals), the Compound convention.
    type: 'function', name: 'getUnderlyingPrice', stateMutability: 'view',
    inputs: [{ name: 'vToken', type: 'address' }], outputs: [{ type: 'uint256' }],
  },
] as const
