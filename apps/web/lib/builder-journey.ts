/**
 * An agent's road from "registered" to "hired", in plain words (My Marque, the Workshop). Each step is read from
 * the same records the owner API already returns (quality checks, declared services and their quote samples, the
 * job cohort); nothing here is inferred or invented. The first step not done is the one next step the Workshop
 * puts a button on. The technical reason stays available behind "Why?".
 */
export type StepState = 'done' | 'next' | 'todo'
export type StepAction =
  | { kind: 'bench'; label: string }
  | { kind: 'link'; label: string; href: string }
  | { kind: 'share'; label: string; href: string }
export interface JourneyStep { id: string; label: string; state: StepState; headline: string; why: string | null; action: StepAction | null }

export interface JourneyAgent {
  chainId: number
  agentId: string
  listedOnMarque: boolean
  quality: { checks: Array<{ id: string; pass: boolean; reason?: string; fix?: string | null }> }
  seller?: {
    services?: Array<{ kind: string; declaredNow: boolean; quote?: { state: string; nextStep?: string | null } }>
    jobs?: { received: number; paid: number }
  }
}

const check = (a: JourneyAgent, id: string) => a.quality.checks.find((c) => c.id === id)

export function journeyOf(a: JourneyAgent, owner: string): JourneyStep[] {
  const manage = `/builders/my-agents?wallet=${owner}&agent=${a.chainId}:${a.agentId}#your-agents`
  const page = `/agents/${a.chainId}/${a.agentId}`
  const identity = check(a, 'identity'), proved = check(a, 'proved'), callable = check(a, 'callable'), tested = check(a, 'tested')
  const live = a.seller?.services?.find((s) => s.declaredNow && s.kind === 'a2a') ?? a.seller?.services?.find((s) => s.declaredNow)
  const priced = live?.quote?.state === 'CURRENT_PROBE_SAMPLE'
  const hired = (a.seller?.jobs?.received ?? 0) > 0

  const raw: Array<Omit<JourneyStep, 'state'> & { done: boolean }> = [
    {
      id: 'yours', label: 'Yours', done: Boolean(identity?.pass && proved?.pass),
      headline: identity?.pass ? 'Prove it is yours with one signature, so buyers know who runs it.' : 'This wallet does not own the agent’s identity on chain.',
      why: (identity?.pass ? proved?.reason : identity?.reason) ?? null,
      action: identity?.pass ? { kind: 'link', label: 'Prove it is yours', href: '/builders/claim' } : null,
    },
    {
      id: 'answers', label: 'Answers', done: Boolean(callable?.pass),
      headline: live ? 'It did not answer Marque’s last call. Get it online, then test it here.' : 'It has no address buyers can call yet. Add one to its registration.',
      why: callable?.reason ?? null,
      action: live ? { kind: 'bench', label: 'Test it now' } : { kind: 'link', label: 'Add its address', href: manage },
    },
    {
      id: 'tested', label: 'Tested', done: Boolean(tested?.pass),
      headline: 'Run a practice task. It is free, private, and shows exactly what to fix.',
      why: tested?.reason ?? null,
      action: { kind: 'bench', label: 'Run a test' },
    },
    {
      id: 'priced', label: 'Priced', done: priced,
      headline: 'Buyers cannot get a price from it yet. It should answer a quote request with a price.',
      why: live?.quote?.nextStep ?? null,
      action: { kind: 'link', label: 'Check its pricing', href: manage },
    },
    {
      id: 'listed', label: 'Listed', done: a.listedOnMarque,
      headline: 'List it on the marketplace so buyers can find it.',
      why: null,
      action: { kind: 'link', label: 'List it', href: manage },
    },
    {
      id: 'hired', label: 'Hired', done: hired,
      headline: 'Ready for its first job. Share its page with someone who needs it.',
      why: null,
      action: { kind: 'share', label: 'Copy its link', href: page },
    },
  ]
  const nextIndex = raw.findIndex((s) => !s.done)
  return raw.map(({ done, ...s }, i) => ({ ...s, state: done ? 'done' : i === nextIndex ? 'next' : 'todo' }))
}

/** One word for where an agent stands, for its tile. */
export function standingOf(steps: JourneyStep[]): { word: string; tone: 'good' | 'work' | 'calm' } {
  const next = steps.find((s) => s.state === 'next')
  if (!next) return { word: 'Hired', tone: 'good' }
  if (next.id === 'hired') return { word: 'Ready for buyers', tone: 'good' }
  if (next.id === 'answers' || next.id === 'yours') return { word: 'Needs a fix', tone: 'work' }
  return { word: 'In progress', tone: 'calm' }
}

/** Test ids in the words a builder uses. */
export const TEST_NAMES: Record<string, string> = {
  'MCS-REB-1': 'Rebalancing test',
  'MCS-GRID-1': 'Grid trading test',
  'MCS-YIELD-1': 'Yield test',
  'MCS-HF-1': 'Health factor test',
  'MCS-RYIELD-1': 'Realised yield test',
}
export const testName = (id: string) => TEST_NAMES[id] ?? id

/** "3 Nov, 08:35" in UTC: the date a person reads, with the exact time in the title. */
export function when(iso: string | null | undefined): string {
  if (!iso) return 'time not recorded'
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z'))
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
}
