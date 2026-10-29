import { describe, expect, it } from 'vitest'
import { createConfig, http } from 'wagmi'
import { mock } from 'wagmi/connectors'
import { bscTestnet } from 'wagmi/chains'
import { repairConnections, watchConnections } from './repair'

const account = '0x00000000000000000000000000000000000000aa' as const
const make = () => createConfig({ chains: [bscTestnet], connectors: [mock({ accounts: [account] })], transports: { [bscTestnet.id]: http('http://127.0.0.1:1') } })
/** What wagmi's storage gives back: the connector reduced to { id, name, type, uid }, no methods. */
function restorePlaceholder(config: ReturnType<typeof make>) {
  const real = config.connectors[0]!
  const { id, name, type, uid } = real
  config.setState((x) => ({ ...x, current: uid, status: 'connected', connections: new Map([[uid, { accounts: [account], chainId: bscTestnet.id, connector: { id, name, type, uid } as never }]]) }))
  return real
}

describe('repairConnections', () => {
  it('puts the live connector back into a connection restored with a placeholder', () => {
    const config = make()
    const real = restorePlaceholder(config)
    expect(typeof (config.state.connections.get(real.uid)!.connector as { getChainId?: unknown }).getChainId).toBe('undefined')
    repairConnections(config)
    const fixed = config.state.connections.get(real.uid)!
    expect(fixed.connector).toBe(real)
    expect(fixed.accounts).toEqual([account])
  })
  it('repairs as soon as the state is restored again while watching, and leaves a healthy state alone', () => {
    const config = make()
    const stop = watchConnections(config)
    const real = restorePlaceholder(config)
    expect(config.state.connections.get(real.uid)!.connector).toBe(real)
    const before = config.state
    repairConnections(config)
    expect(config.state).toBe(before)
    stop()
  })
})
