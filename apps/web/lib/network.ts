/**
 * The one place a chain id becomes a name, a badge and an explorer URL
 * (P10.5A item 2).
 *
 * Every surface that shows or produces a transaction resolves its own network
 * from the chain id that transaction was actually built for — never from a
 * global constant, and never from the footer. A charter granted on testnet and
 * a page footer that says "chain 56" is the exact contradiction this removes.
 */

export interface NetInfo {
  id: number
  /** For a badge: "BSC mainnet · 56" / "BSC testnet · 97". */
  short: string
  /** Prose name. */
  name: string
  explorer: string
}

const NETS: Record<number, NetInfo> = {
  56: { id: 56, short: 'BSC mainnet · 56', name: 'BNB Smart Chain', explorer: 'https://bscscan.com' },
  97: { id: 97, short: 'BSC testnet · 97', name: 'BNB Smart Chain testnet', explorer: 'https://testnet.bscscan.com' },
}

/** Resolve a chain id. Unknown ids get a labelled fallback rather than a wrong guess. */
export function network(chainId: number | string | null | undefined): NetInfo {
  const id = Number(chainId)
  return NETS[id] ?? { id: Number.isFinite(id) ? id : 0, short: `chain ${chainId ?? '?'}`, name: `chain ${chainId ?? '?'}`, explorer: '' }
}

export function explorerTx(chainId: number | string | null | undefined, hash: string): string {
  const base = network(chainId).explorer
  return base ? `${base}/tx/${hash}` : ''
}

export function explorerAddress(chainId: number | string | null | undefined, address: string): string {
  const base = network(chainId).explorer
  return base ? `${base}/address/${address}` : ''
}

export function explorerToken(chainId: number | string | null | undefined, address: string): string {
  const base = network(chainId).explorer
  return base ? `${base}/token/${address}` : ''
}
