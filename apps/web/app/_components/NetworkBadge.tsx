import { Chip } from '@marque/ui'
import { network } from '../../lib/network'

/**
 * The network a transaction lives on, rendered from the chain id it was built
 * for (P10.5A item 2). Put this on every surface that shows or produces a
 * transaction; never rely on the footer to establish the network.
 */
export function NetworkBadge({ chainId }: { chainId: number | string | null | undefined }) {
  const net = network(chainId)
  return (
    <span title={net.explorer ? `Explorer: ${net.explorer}` : undefined}>
      <Chip tone="chain">{net.short}</Chip>
    </span>
  )
}
