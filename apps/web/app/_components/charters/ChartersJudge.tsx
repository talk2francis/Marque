import { CHARTER_CHAINS, KIND_NAMES, type CharterKind } from '@marque/charters'
import { listGuards } from '../../../lib/guards'
import { listChartersV2 } from '../../../lib/charters-v2'

/** The Judge page's Charters steps (16_PUBLIC_COPY): the 60-second path, with one live charter per kind read from the index. */
export async function chartersJudgeSteps(): Promise<Array<{ title: string; note: string; href: string; cta: string }>> {
  const kinds: CharterKind[] = ['loan', 'yield', 'grid', 'range']
  const live: Array<{ kind: CharterKind; chainId: number; address: string }> = []
  for (const kind of kinds) {
    for (const chainId of [56, 97] as const) {
      const r = await listChartersV2({ chainId, kind, state: 'all', limit: 5 }).catch(() => null)
      const c = r?.charters.find((x) => x.actions > 0) ?? r?.charters[0]
      if (c) { live.push({ kind, chainId, address: c.address }); break }
      if (kind === 'loan' && CHARTER_CHAINS[chainId].factory) {
        const g = await listGuards({ chainId, state: 'all', limit: 1 }).catch(() => null)
        if (g?.guards[0]) { live.push({ kind, chainId, address: g.guards[0].address }); break }
      }
    }
  }
  const first = live[0]
  return [
    { title: 'Open Charters', note: 'Four kinds, each with its sentence and its live charter.', href: '/charters', cta: 'Open Charters' },
    ...live.map((l) => ({ title: `Open a live ${KIND_NAMES[l.kind]}${l.chainId === 56 ? '' : ' (testnet)'}`, note: 'Read the action, the before and after, and the receipt, all from the chain.', href: `/charters/${l.chainId}/${l.address}`, cta: 'Open the charter' })),
    { title: 'Click an agent’s KeyStore key', note: 'On a charter page, Check it yourself names the agent’s key on Altana KeyStore: one contract, one function, until a date.', href: first ? `/charters/${first.chainId}/${first.address}#verify-h` : '/charters', cta: 'See the key' },
    { title: 'Drag the marks, no wallet needed', note: 'Open any builder with the demo address and drag the marks.', href: '/charters/new?kind=grid', cta: 'Open a builder' },
    { title: 'Read the contracts and tests', note: 'Unit, fuzz, invariant, cross-category, differential and fork suites.', href: 'https://github.com/talk2francis/Marque/tree/main/contracts/src/charters', cta: 'Read the source' },
  ]
}
