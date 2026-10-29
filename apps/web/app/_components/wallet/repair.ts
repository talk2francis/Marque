'use client'
import type { Config } from 'wagmi'
import { watchConnectors } from 'wagmi/actions'

/**
 * Keep every wallet connection pointing at its live connector (29 Oct).
 *
 * wagmi saves connections with a bare placeholder for the connector ({ id, name, type, uid }, no methods) and swaps
 * the real one back in when it reconnects. Marque mounts its wallet provider in several islands (the header, the hire
 * sheet, the quest bar); each mount reloads that saved state, and when a second mount lands while a reconnect is
 * already running, wagmi skips its own repair. The connection then holds the placeholder and the first signature
 * fails with "connector.getChainId is not a function" (seen on Marque Pass hires since 28 Oct). This puts the live
 * connector, matched by uid then an unambiguous id, back into any connection that lost it. A reloaded connector has a
 * new uid, so its map key and the current selection move together. Unavailable wallets wait for discovery without
 * publishing another broken state. This never connects or disconnects a wallet or requests a signature.
 */
type Connector = Config['connectors'][number]
export function repairConnections(config: Config): void {
  const live = (stale: Connector) => {
    if (typeof stale.getChainId === 'function') return stale
    const exact = config.connectors.find((x) => x.uid === stale.uid)
    if (exact) return exact
    const matches = config.connectors.filter((x) => x.id === stale.id && x.type === stale.type)
    return matches.length === 1 ? matches[0] : undefined
  }
  config.setState((x) => {
    let connections: typeof x.connections | undefined
    let current = x.current
    for (const [key, c] of x.connections) {
      if (key === c.connector.uid && typeof (c.connector as Partial<Connector>).getChainId === 'function') continue
      const real = live(c.connector)
      if (!real) continue
      connections ??= new Map(x.connections)
      if (key !== real.uid) connections.delete(key)
      const existing = connections.get(real.uid)
      if (!existing || typeof (existing.connector as Partial<Connector>).getChainId !== 'function') {
        connections.set(real.uid, { ...(existing ?? c), connector: real })
      }
      if (current === key) current = real.uid
    }
    return connections ? { ...x, connections, current } : x
  })
}

/** Watch the wallet state and repair a connection the moment it is restored with a placeholder. */
export function watchConnections(config: Config): () => void {
  repairConnections(config)
  const stopConnections = config.subscribe((s) => s.connections, () => repairConnections(config))
  const stopConnectors = watchConnectors(config, { onChange: () => repairConnections(config) })
  return () => { stopConnections(); stopConnectors() }
}
