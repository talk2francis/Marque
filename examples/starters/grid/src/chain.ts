import { createPublicClient, http, parseAbi, type PublicClient } from 'viem'
import { bsc } from 'viem/chains'

/** Read-only. There is no wallet and no signing in this file, by design. */
export interface ChainReader { client: PublicClient; blockNumber?: bigint }

export function reader(blockNumber?: bigint): ChainReader {
  const url = process.env['BSC_RPC_URL']
  if (!url) throw new Error('Set BSC_RPC_URL in .env (a BSC RPC that serves historical state).')
  return { client: createPublicClient({ chain: bsc, transport: http(url) }) as PublicClient, blockNumber }
}

export const ADDRESSES = {
  pancakeV3PositionManager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
  pancakeV3Factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  venusComptroller: '0xfD36E2c2a6789Db23113685031d7F16329158384',
  venusOracle: '0x6592b5DE802159F3E74B2486b091D11a8256ab8A',
  wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  usdt: '0x55d398326f99059fF775485246999027B3197955',
} as const

export const abis = {
  erc20: parseAbi(['function decimals() view returns (uint8)', 'function symbol() view returns (string)', 'function balanceOf(address) view returns (uint256)']),
  comptroller: parseAbi(['function getAssetsIn(address) view returns (address[])', 'function markets(address) view returns (bool isListed, uint256 collateralFactorMantissa, bool isVenus)', 'function getAccountLiquidity(address) view returns (uint256, uint256, uint256)', 'function oracle() view returns (address)', 'function getAllMarkets() view returns (address[])']),
  vToken: parseAbi(['function getAccountSnapshot(address) view returns (uint256, uint256, uint256, uint256)', 'function underlying() view returns (address)', 'function symbol() view returns (string)', 'function supplyRatePerBlock() view returns (uint256)', 'function borrowRatePerBlock() view returns (uint256)']),
  oracle: parseAbi(['function getUnderlyingPrice(address) view returns (uint256)']),
  positionManager: parseAbi(['function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256, uint256, uint128, uint128)', 'function ownerOf(uint256) view returns (address)']),
  factory: parseAbi(['function getPool(address, address, uint24) view returns (address)']),
  pool: parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool)', 'function tickSpacing() view returns (int24)', 'function liquidity() view returns (uint128)']),
} as const

