import { parseAbi } from 'viem'
import type { ChainId } from './config.js'

/** ERC-8004 ReputationRegistry, not in the SDK. Proxy addresses measured in PROTOCOL-FACTS. */
export const REPUTATION_REGISTRY: Record<ChainId, `0x${string}`> = {
  56: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  97: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
}

export const reputationAbi = parseAbi([
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)',
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)',
])

