import { describe, expect, it } from 'vitest'
import { createConfig, http, injected } from 'wagmi'
import { bsc } from 'wagmi/chains'
import { keepConnectorsUnique, uniqueConnectors } from './dedupe'

describe('one connector per detected wallet (26 Nov 2026)', () => {
  it('keeps the first of each id and returns the same array when nothing repeats', () => {
    const a = [{ id: 'io.rabby' }, { id: 'com.bitget.web3' }]
    expect(uniqueConnectors(a)).toBe(a)
    const b = [{ id: 'io.rabby', n: 1 }, { id: 'com.bitget.web3', n: 2 }, { id: 'com.okex.wallet', n: 3 }, { id: 'com.bitget.web3', n: 4 }, { id: 'com.okex.wallet', n: 5 }]
    expect(uniqueConnectors(b).map((c) => c.n)).toEqual([1, 2, 3])
  })

  it('removes the copies each extra provider mount appends (what wagmi hydrate does per WagmiProvider)', () => {
    const config = createConfig({ chains: [bsc], transports: { [bsc.id]: http('http://127.0.0.1:1') }, connectors: [injected()], ssr: true, multiInjectedProviderDiscovery: false })
    keepConnectorsUnique(config)
    const store = config._internal.connectors
    const announced = (rdns: string, name: string) => store.setup(injected({ target: { id: rdns, name, provider: () => undefined } }))
    // Three islands mount: each appends the announced wallets again.
    for (let mount = 0; mount < 3; mount++) store.setState((list) => [...list, announced('com.bitget.web3', 'Bitget Wallet'), announced('com.okex.wallet', 'OKX Wallet')])
    expect(config.connectors.map((c) => c.name)).toEqual(['Injected', 'Bitget Wallet', 'OKX Wallet'])
  })
})
