'use client'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { HireQuote } from '@marque/commerce/client'
import { TaskForm, type TaskValue } from '../_components/hire/TaskForm'
import { Badge } from '../_components/ui'
import styles from './tender.module.css'

/**
 * The Tender screen (SPEC-SUPPLY 5): one structured task, streamed answers from every compatible
 * agent, three named sorts, and Hire on any priced row with that exact quote. Quotes are kept for
 * this tab only (sessionStorage) so the hire sheet can reuse one without asking again.
 */
type Lane = 'mainnet' | 'practice'
interface Asked {
  agentId: string; tokenId: string | null; chainId: number; name: string; operator: string | null; isReference: boolean
  warrant: { status: 'warranted' | 'failed' | 'untested'; testId: string | null; date: string | null; failedField: string | null }
  delivered: number; medianSeconds: number | null; rating: { stars: number | null; count: number }
}
type Answer = { state: 'asking' } | { state: 'priced'; quote: HireQuote; ms: number } | { state: 'declined' | 'failed'; reason: string; ms: number }
type Sort = 'evidence' | 'price' | 'fast'
const SORT_LABEL: Record<Sort, string> = { evidence: 'Best evidence', price: 'Lowest price', fast: 'Fastest' }
const CATEGORIES = [
  { value: 'health_factor', label: 'Health factor' }, { value: 'yield', label: 'Yield' }, { value: 'grid', label: 'Grid trading' },
  { value: 'rebalancing', label: 'Rebalancing' }, { value: 'security', label: 'Security' },
]

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [active])
  return now
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const units = (q: HireQuote) => Number(q.price) / 10 ** q.token.decimals

export function TenderView({ initialCategory, initialLane }: { initialCategory: string; initialLane: Lane }) {
  const [category, setCategory] = useState(initialCategory)
  const [lane, setLane] = useState<Lane>(initialLane)
  const [task, setTask] = useState<TaskValue>({ task: '', ready: false, missing: null })
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tenderId, setTenderId] = useState<string | null>(null)
  const [asked, setAsked] = useState<Asked[]>([])
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [sentTask, setSentTask] = useState<string | null>(null)
  const [done, setDone] = useState<{ asked: number; priced: number; declined: number; failed: number; ms: number } | null>(null)
  const [sort, setSort] = useState<Sort>('evidence')
  const startedAt = useRef(0)
  const now = useNow(Boolean(tenderId))

  const run = async () => {
    if (!task.ready || !task.structured || running) return
    setRunning(true); setError(null); setTenderId(null); setAsked([]); setAnswers({}); setDone(null); setSentTask(null)
    startedAt.current = Date.now()
    try {
      const res = await fetch('/api/v1/tender', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify({ category, task: task.structured.fields, lane }) })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({})) as { detail?: string }
        throw new Error(j.detail ?? 'Quotes could not be requested just now. Try again in a minute.')
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let id: string | null = null
      let sentence = ''
      const kept: Record<string, HireQuote> = {}
      for (;;) {
        const { value, done: end } = await reader.read()
        if (end) break
        buf += dec.decode(value, { stream: true })
        let cut: number
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, cut); buf = buf.slice(cut + 2)
          const data = frame.split('\n').find((l) => l.startsWith('data: '))?.slice(6)
          if (!data) continue
          const e = JSON.parse(data) as { type: string } & Record<string, unknown>
          if (e.type === 'start') {
            id = String(e['tenderId']); sentence = String(e['task']); setTenderId(id); setSentTask(sentence)
            const list = e['asked'] as Asked[]
            setAsked(list); setAnswers(Object.fromEntries(list.map((a) => [a.agentId, { state: 'asking' } as Answer])))
          } else if (e.type === 'quote') {
            const q = e['quote'] as HireQuote
            kept[String(e['agentId'])] = q
            try { sessionStorage.setItem(`marque:tender:${id}`, JSON.stringify({ task: sentence, structured: task.structured, quotes: kept })) } catch { /* the Hire button still asks for a fresh quote */ }
            setAnswers((a) => ({ ...a, [String(e['agentId'])]: { state: 'priced', quote: q, ms: Number(e['ms']) } }))
          } else if (e.type === 'declined' || e.type === 'failed') {
            setAnswers((a) => ({ ...a, [String(e['agentId'])]: { state: e.type as 'declined' | 'failed', reason: String(e['reason']), ms: Number(e['ms']) } }))
          } else if (e.type === 'done') {
            setDone({ asked: Number(e['asked']), priced: Number(e['priced']), declined: Number(e['declined']), failed: Number(e['failed']), ms: Number(e['ms']) })
          } else if (e.type === 'error') setError(String(e['detail']))
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quotes could not be requested just now.')
    } finally { setRunning(false) }
  }

  const rows = useMemo(() => {
    const list = asked.map((a, i) => ({ a, i, ans: answers[a.agentId] ?? ({ state: 'asking' } as Answer) }))
    const priced = (r: (typeof list)[number]) => (r.ans.state === 'priced' ? 0 : r.ans.state === 'asking' ? 1 : 2)
    return list.sort((x, y) => {
      if (sort === 'evidence') return priced(x) - priced(y) || x.i - y.i
      if (sort === 'price') {
        const px = x.ans.state === 'priced' ? units(x.ans.quote) : Infinity, py = y.ans.state === 'priced' ? units(y.ans.quote) : Infinity
        return priced(x) - priced(y) || px - py || x.i - y.i
      }
      return priced(x) - priced(y) || (x.a.medianSeconds ?? Infinity) - (y.a.medianSeconds ?? Infinity) || x.i - y.i
    })
  }, [asked, answers, sort])
  const pricedCount = Object.values(answers).filter((a) => a.state === 'priced').length
  const declinedCount = Object.values(answers).filter((a) => a.state === 'declined').length
  const elapsed = done ? done.ms : running ? Date.now() - startedAt.current : 0

  return (
    <div className={styles.body}>
      <section className={styles.form} aria-label="The task">
        <div className={styles.formTop}>
          <label className={styles.pick}>
            <span>Category</span>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setTenderId(null); setAsked([]) }} disabled={running}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <div className={styles.lanes} role="radiogroup" aria-label="Network">
            {(['mainnet', 'practice'] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lane === l} data-on={lane === l || undefined} disabled={running} onClick={() => setLane(l)}>
                {l === 'mainnet' ? 'Mainnet' : 'Practice'}<span>{l === 'mainnet' ? 'real money' : 'BSC testnet, free'}</span>
              </button>
            ))}
          </div>
        </div>
        <TaskForm key={category} category={category} agentName="the agent" onChange={setTask} disabled={running} />
        <div className={styles.go}>
          <button type="button" className="btn btn--primary" disabled={!task.ready || running} onClick={run}>{running ? 'Asking every agent…' : 'Get quotes from every agent'}</button>
          <span className={styles.muted}>{task.ready ? 'Free. No wallet needed until you hire.' : task.missing}</span>
        </div>
      </section>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {tenderId ? (
        <section className={styles.results} aria-labelledby="tender-results" aria-busy={running}>
          <header className={styles.resHead}>
            <div>
              <h2 id="tender-results" className={styles.h2}>Quotes for: {sentTask}</h2>
              <p className={styles.counts} aria-live="polite">
                {lane === 'mainnet' ? 'Mainnet' : 'BSC testnet · test tokens, no real value'} · {asked.length} asked · {pricedCount} priced in {(elapsed / 1000).toFixed(1)} s{declinedCount ? ` · ${declinedCount} declined` : ''}
              </p>
            </div>
            <div className={styles.sorts} role="radiogroup" aria-label="Sort">
              <span>Sort</span>
              {(Object.keys(SORT_LABEL) as Sort[]).map((k) => <button key={k} type="button" role="radio" aria-checked={sort === k} data-on={sort === k || undefined} onClick={() => setSort(k)}>{SORT_LABEL[k]}</button>)}
            </div>
          </header>
          {asked.length === 0 ? <p className={styles.empty}>No agent on this network can price this category right now. <Link href="/builders">Build one</Link>, or try the other network.</p> : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Agent</th><th>Price</th><th>Terms</th><th>Proof</th><th>Delivers</th><th aria-label="Hire" /></tr></thead>
                <tbody>
                  {rows.map(({ a, ans }) => {
                    const href = a.chainId === 97 ? `/agents/97/${a.tokenId}` : `/agents/${a.tokenId}`
                    const left = ans.state === 'priced' ? ans.quote.expiresAt - now / 1000 : 0
                    return (
                      <tr key={a.agentId} data-state={ans.state}>
                        <td data-label="Agent"><span className={styles.agent}><Link href={href}>{a.name}</Link>{a.isReference ? <Badge kind="reference" /> : <span className={styles.op}>{a.operator}</span>}</span></td>
                        {ans.state === 'priced' ? (
                          <>
                            <td data-label="Price" className={styles.price}>{ans.quote.priceLabel}</td>
                            <td data-label="Terms">{left > 0 ? <>{ans.quote.signed ? 'signed' : 'identity checked'} · <span className={styles.mono}>{mmss(left)}</span></> : <span className={styles.muted}>quote lapsed</span>}</td>
                          </>
                        ) : (
                          <td data-label="Answer" colSpan={2} className={styles.answer}>
                            {ans.state === 'asking' ? <span className={styles.asking}>{running ? 'asking…' : 'no answer in 10 s'}</span> : <span className={styles.muted}>{ans.state === 'declined' ? 'declined: ' : ''}{ans.reason}</span>}
                          </td>
                        )}
                        <td data-label="Proof">{a.warrant.status === 'warranted' ? <span className={styles.warranted}>Warranted {a.warrant.testId ?? ''}</span> : a.warrant.status === 'failed' ? <span>Tested{a.warrant.failedField ? `, ${a.warrant.failedField} wrong` : ''}</span> : <span className={styles.muted}>Untested</span>}</td>
                        <td data-label="Delivers">{a.delivered ? <>{a.medianSeconds !== null ? `${Math.round(a.medianSeconds)} s median, ` : ''}{a.delivered} job{a.delivered === 1 ? '' : 's'}</> : <span className={styles.muted}>new</span>}</td>
                        <td className={styles.act}>{ans.state === 'priced' && left > 60 ? <Link className="btn btn--sm btn--primary" href={`?hire=${encodeURIComponent(a.agentId)}&serviceId=${ans.quote.serviceId ?? ''}&tender=${tenderId}`} scroll={false}>Hire</Link> : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className={styles.note}>
            Sorted by {SORT_LABEL[sort].toLowerCase()}{sort === 'evidence' ? ': Warranted first, then delivered jobs, then tested' : ''}. At most one agent per operator and two Marque reference agents are asked. Each price is for exactly the task above; Hire uses that quote while it is valid. <Link href="/docs/attribution">How Marque names itself in the job</Link> <ArrowUpRight aria-hidden="true" className={styles.ico} />
          </p>
        </section>
      ) : null}
    </div>
  )
}
