import { Activity, Braces, Columns2, Gauge, KeyRound, Layers, Network, Receipt, Scale, ShieldCheck } from 'lucide-react'
import type { NavIcon } from '../nav-items'

const MAP = { standard: ShieldCheck, ledger: Scale, receipt: Receipt, proof: Activity, status: Gauge, protocol: Network, desk: Layers, charter: KeyRound, compare: Columns2, api: Braces } as const

export function NavGlyph({ name, size = 15 }: { name: NavIcon; size?: number }) {
  const I = MAP[name]
  return <I size={size} strokeWidth={1.7} aria-hidden="true" />
}
