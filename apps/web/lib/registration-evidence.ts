/** ERC-721 mint evidence: canonical registry, zero sender and exact token id. */
export function isIdentityMint(log: {address:string; topics: readonly string[]}, registry:string, tokenId:string): boolean {
  if (!/^\d+$/.test(tokenId)) return false
  const transfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  return log.address.toLowerCase() === registry.toLowerCase()
    && log.topics.length === 4
    && log.topics[0]?.toLowerCase() === transfer
    && log.topics[1] === '0x' + '0'.repeat(64)
    && log.topics[3]?.toLowerCase() === '0x' + BigInt(tokenId).toString(16).padStart(64, '0')
}
