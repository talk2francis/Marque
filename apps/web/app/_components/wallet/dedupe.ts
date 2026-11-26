import type { Config } from 'wagmi'

type Connector = Config['connectors'][number]

/** The connectors with each id kept once (first wins), or the same array when nothing repeats. */
export function uniqueConnectors<T extends Pick<Connector, 'id'>>(list: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  const unique = list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
  return unique.length === list.length ? list : unique
}

/**
 * One entry per detected wallet (26 Nov 2026).
 *
 * Marque mounts its wallet provider in several islands (the header, a route layout, the hire sheet). With SSR on,
 * each mount appends the EIP-6963 wallets the browser announced, and wagmi skips only those whose rdns a connector
 * already declares; the connectors it builds for announced wallets declare none. So every extra mount added
 * another Bitget, OKX or Trust Wallet to the connect dialog, and a restored connection had several equal
 * candidates to repair to (repair.ts needs exactly one). This keeps the first connector of each id.
 */
export function keepConnectorsUnique(config: Config): void {
  const store = config._internal.connectors
  const apply = (list: readonly Connector[]) => {
    const unique = uniqueConnectors(list)
    if (unique !== list) store.setState([...unique])
  }
  store.subscribe(apply)
  apply(config.connectors)
}
