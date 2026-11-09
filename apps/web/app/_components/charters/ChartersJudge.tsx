import { CHARTER_CHAINS } from '@marque/charters'
import { listGuards } from '../../../lib/guards'

/** The Judge page's Charters section (11_PUBLIC_COPY): the 60-second path, with the live charter read from the index. */
export async function ChartersJudge({ className, stepClass }: { className?: string; stepClass?: string }) {
  let live: { chainId: number; address: string } | null = null
  for (const chainId of [56, 97] as const) {
    if (!CHARTER_CHAINS[chainId].factory) continue
    const r = await listGuards({ chainId, state: 'armed', limit: 1 }).catch(() => null)
    if (r?.guards[0]) { live = r.guards[0]; break }
  }
  const steps: Array<{ title: string; note: string; href: string; cta: string }> = [
    { title: 'Watch the Night Replay', note: 'A labelled simulation of a night BNB fell 40%, run through the guard’s real repayment math.', href: '/charters', cta: 'Open Charters' },
    ...(live ? [{ title: `Open the live ${live.chainId === 56 ? 'mainnet' : 'testnet'} charter`, note: 'Read its action, the health before and after, and the receipt, all from the chain.', href: `/charters/${live.chainId}/${live.address}`, cta: 'Open the charter' }] : []),
    { title: 'Check Keel’s key', note: 'On the charter page, Check it yourself links to Altana KeyStore: one contract, one function, until a date.', href: live ? `/charters/${live.chainId}/${live.address}#verify-h` : '/charters', cta: 'See the key' },
    { title: 'Draw a line on a real loan', note: 'The builder reads the demo address’s Venus loan. Drag the two marks. No wallet needed.', href: '/charters/new', cta: 'Open the builder' },
    { title: 'Read the contracts', note: 'CharterFactory, LoanGuard and CharterRules, with 34 unit tests, 9 invariants and fork suites on both chains.', href: 'https://github.com/talk2francis/Marque/tree/main/contracts/src/charters', cta: 'Read the source' },
  ]
  return (
    <section aria-labelledby="charters-60" className={className}>
      <h2 id="charters-60">Charters, in 60 seconds</h2>
      <ol>
        {steps.map((s, i) => (
          <li key={s.title} className={stepClass}>
            <b>{i + 1}. {s.title}</b> <span>{s.note}</span> <a className="btn btn--sm" href={s.href}>{s.cta}</a>
          </li>
        ))}
      </ol>
    </section>
  )
}
