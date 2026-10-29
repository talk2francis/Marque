'use client'
import type { Config } from 'wagmi'

/**
 * Keep every wallet connection pointing at its live connector (29 Oct).
 *
 * wagmi saves connections with a bare placeholder for the connector ({ id, name, type, uid }, no methods) and swaps
 * the real one back in when it reconnects. Marque mounts its wallet provider in several islands (the header, the hire
 * sheet, the quest bar); each mount reloads that saved state, and when a second mount lands while a reconnect is
 * already running, wagmi skips its own repair. The connection then holds the placeholder and the first signature
 * fails with "connector.getChainId is not a function" (seen on Marque Pass hires since 28 Oct). This puts the live
 * connector, matched by uid then id, back into any connection that lost it. It never connects or disconnects anything.
 */
type Connector = Config['connectors'][number]
export function repairConnections(config: Config): void {
  const state = config.state
  let broken = false
  for (const c of state.connections.values()) if (typeof (c.connector as Partial<Connector>).getChainId !== 'function') { broken = true; break }
  if (!broken) return
  const live = (stale: { uid: string; id: string }) => config.connectors.find((x) => x.uid === stale.uid) ?? config.connectors.find((x) => x.id === stale.id)
  config.setState((x) => {
    const connections = new Map(x.connections)
    for (const [key, c] of connections) {
      if (typeof (c.connector as Partial<Connector>).getChainId === 'function') continue
      const real = live(c.connector)
      if (real) connections.set(key, { ...c, connector: real })
    }
    return { ...x, connections }
  })
}

/** Watch the wallet state and repair a connection the moment it is restored with a placeholder. */
export function watchConnections(config: Config): () => void {
  repairConnections(config)
  return config.subscribe((s) => s.connections, () => repairConnections(config))
}
