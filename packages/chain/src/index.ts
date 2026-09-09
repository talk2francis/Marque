export { RpcPool, type PoolOptions, type PoolStats } from './pool.js'
export {
  BSC_MAINNET_ID, BSC_TESTNET_ID, DEFAULT_BSC_RPCS,
  rpcPool, publicClient, clientFor, getBlockNumber,
  archiveClient, hasArchive,
  multicallAllowFailure, read, type ReadCall,
} from './client.js'
