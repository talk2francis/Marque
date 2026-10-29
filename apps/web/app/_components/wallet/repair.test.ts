import { describe, expect, it } from 'vitest'
import { createConfig, http } from 'wagmi'
import { mock } from 'wagmi/connectors'
import { bscTestnet } from 'wagmi/chains'
import { disconnect } from 'wagmi/actions'
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
  it('leaves an unavailable wallet unchanged until its live connector exists', () => {
    const config = make()
    config.setState((x) => ({ ...x, current: 'unavailable-wallet', status: 'connected', connections: new Map([['unavailable-wallet', { accounts: [account], chainId: bscTestnet.id, connector: { id: 'not-installed', uid: 'unavailable-wallet', name: 'Unavailable wallet', type: 'injected' } as never }]]) }))
    const before = config.state
    repairConnections(config)
    expect(config.state).toBe(before)
  })
  it('does not repeatedly publish an unrepairable connection to its own watcher', () => {
    const config = make()
    let notifications = 0
    // Bound the regression so a state-update loop fails this test without overflowing the stack.
    const guard = config.subscribe((x) => x.connections, () => {
      if (++notifications > 2) throw new Error('repeated wallet-state updates')
    })
    const stop = watchConnections(config)
    try {
      const real = config.connectors[0]!
      expect(() => config.setState((x) => ({ ...x, current: 'old-wallet', status: 'connected', connections: new Map([['old-wallet', { accounts: [account], chainId: bscTestnet.id, connector: { id: 'not-installed', uid: 'old-wallet', name: real.name, type: real.type } as never }]]) }))).not.toThrow()
      expect(notifications).toBe(1)
    } finally { stop(); guard() }
  })
  it('rekeys a restored wallet so disconnect removes the real connection after reload', async () => {
    const config = make()
    const real = config.connectors[0]!
    config.setState((x) => ({ ...x, current: 'persisted-uid', status: 'connected', connections: new Map([['persisted-uid', { accounts: [account], chainId: bscTestnet.id, connector: { id: real.id, uid: 'persisted-uid', name: real.name, type: real.type } as never }]]) }))
    repairConnections(config)
    expect(config.state.current).toBe(real.uid)
    expect(config.state.connections.has('persisted-uid')).toBe(false)
    expect(config.state.connections.get(real.uid)?.connector).toBe(real)
    await disconnect(config)
    expect(config.state.connections.size).toBe(0)
    expect(config.state.status).toBe('disconnected')
  })
  it('keeps the current live accounts when a stale copy of the same wallet is restored', () => {
    const config = make()
    const real = config.connectors[0]!
    const liveAccount = '0x00000000000000000000000000000000000000bb' as const
    config.setState((x) => ({ ...x, current: 'persisted-uid', status: 'connected', connections: new Map([
      ['persisted-uid', { accounts: [account], chainId: bscTestnet.id, connector: { id: real.id, uid: 'persisted-uid', name: real.name, type: real.type } as never }],
      [real.uid, { accounts: [liveAccount], chainId: bscTestnet.id, connector: real }],
    ]) }))
    repairConnections(config)
    expect(config.state.connections.size).toBe(1)
    expect(config.state.current).toBe(real.uid)
    expect(config.state.connections.get(real.uid)?.accounts).toEqual([liveAccount])
  })
  it('repairs a saved connection when its wallet is discovered after the provider mounts', () => {
    const config = make()
    const real = config.connectors[0]!
    config._internal.connectors.setState([])
    config.setState((x) => ({ ...x, current: 'persisted-uid', status: 'connected', connections: new Map([['persisted-uid', { accounts: [account], chainId: bscTestnet.id, connector: { id: real.id, uid: 'persisted-uid', name: real.name, type: real.type } as never }]]) }))
    const stop = watchConnections(config)
    try {
      config._internal.connectors.setState([real])
      expect(config.state.current).toBe(real.uid)
      expect(config.state.connections.get(real.uid)?.connector).toBe(real)
    } finally { stop() }
  })
  it('normalises a healthy connector left under an old map key by an earlier repair', () => {
    const config = make()
    const real = config.connectors[0]!
    config.setState((x) => ({ ...x, current: 'old-key', status: 'connected', connections: new Map([['old-key', { accounts: [account], chainId: bscTestnet.id, connector: real }]]) }))
    repairConnections(config)
    expect(config.state.current).toBe(real.uid)
    expect(config.state.connections.has('old-key')).toBe(false)
    expect(config.state.connections.get(real.uid)?.accounts).toEqual([account])
  })
  it('does not guess between two discovered wallets that advertise the same connector id', () => {
    const config = createConfig({ chains: [bscTestnet], connectors: [mock({ accounts: [account] }), mock({ accounts: ['0x00000000000000000000000000000000000000bb'] })], transports: { [bscTestnet.id]: http('http://127.0.0.1:1') } })
    const real = config.connectors[0]!
    config.setState((x) => ({ ...x, current: 'old-key', status: 'connected', connections: new Map([['old-key', { accounts: [account], chainId: bscTestnet.id, connector: { id: real.id, uid: 'old-key', name: real.name, type: real.type } as never }]]) }))
    const before = config.state
    repairConnections(config)
    expect(config.state).toBe(before)
  })
})
