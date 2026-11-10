import { KIND_NAMES, type CharterKind } from '@marque/charters/client'
import styles from './ExecutionChips.module.css'

type Execution = { chainId: number; kind: CharterKind; actions: number; lastAction: string }
/** The same narrow, chain-counted evidence in cards and lists (C8). */
export function ExecutionChips({ executions }: { executions?: Execution[] }) {
  if (!executions?.length) return null
  return <span className={styles.group} role="group" aria-label="Onchain charter experience">
    {executions.map((e, i) => <span key={`${e.chainId}-${e.kind}-${i}`} className={styles.chip} title={`Onchain: ${e.actions} action${e.actions === 1 ? '' : 's'}, last ${e.lastAction}`}>
      Onchain · Executed {KIND_NAMES[e.kind]} · {e.chainId === 56 ? 'mainnet' : 'testnet'} · {e.actions}
    </span>)}
  </span>
}
