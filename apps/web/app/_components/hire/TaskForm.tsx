'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { Field, SelectField } from '../ui/Field'
import { gridTask, hfTask, rebalanceTask, securityTask, yieldTask } from '../../../lib/hire-tasks'

/**
 * The task, as a small form per category (DESIGN-SYSTEM.md 8.5 step 1). Each form
 * composes the plain-English sentence the agent's own parser accepts
 * (packages/agent-engines, plain-tasks.test.ts), so a buyer never pays for a
 * refusal and never types a placeholder. "Write it yourself" is always there.
 */
export interface TaskValue { task: string; ready: boolean; missing: string | null }

const ADDR = /^0x[0-9a-fA-F]{40}$/
// A real Venus account with a live loan, the MCS-HF-1 subject (docs/standard). Shown as an example only.
const EXAMPLE_LOAN = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
// Marque's own PancakeSwap V3 position (the proof-run LP, docs/pancakeswap-proof.json).
const EXAMPLE_POSITION = '7367728'

const num = (v: string) => (v.trim() === '' ? null : Number(v))
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4))))

export function TaskForm({ category, agentName, onChange, disabled, taskExample }: {
  category: string | null; agentName: string; onChange: (v: TaskValue) => void; disabled?: boolean
  /** The seller's own example task when it works from a JSON object instead of a sentence. */
  taskExample?: string | null
}) {
  const [own, setOwn] = useState(false)
  const [free, setFree] = useState('')
  const shape = jsonShape(taskExample)
  const inner = shape
    ? <Structured shape={shape} category={category} agentName={agentName} onChange={own ? () => undefined : onChange} disabled={disabled} />
    : <Inner category={category} agentName={agentName} onChange={own ? () => undefined : onChange} disabled={disabled} />
  useEffect(() => {
    if (own) onChange({ task: free.trim(), ready: free.trim().length >= 12, missing: free.trim().length >= 12 ? null : 'Describe the task in a sentence.' })
  }, [own, free])
  return (
    <div className="taskform">
      {own ? (
        <div className="fld">
          <label className="fld-label" htmlFor="own-task"><span>Your task for {agentName}</span></label>
          <textarea id="own-task" className="taskform-text" rows={4} maxLength={1200} value={free} disabled={disabled} onChange={(e) => setFree(e.target.value)} placeholder={`Say what ${agentName} should work on, with the numbers it needs.`} />
        </div>
      ) : inner}
      {category !== null ? (
        <button type="button" className="taskform-toggle" onClick={() => setOwn((o) => !o)} disabled={disabled}>
          {own ? 'Use the form instead' : 'Write the task yourself'}
        </button>
      ) : null}
    </div>
  )
}

function Inner({ category, agentName, onChange, disabled }: { category: string | null; agentName: string; onChange: (v: TaskValue) => void; disabled?: boolean }) {
  switch (category) {
    case 'health_factor': return <HealthFactor agentName={agentName} onChange={onChange} disabled={disabled} />
    case 'grid': return <Grid onChange={onChange} disabled={disabled} />
    case 'rebalancing': return <Rebalance onChange={onChange} disabled={disabled} />
    case 'yield': return <Yield onChange={onChange} disabled={disabled} />
    case 'security': return <Security onChange={onChange} disabled={disabled} />
    default: return <Free agentName={agentName} onChange={onChange} disabled={disabled} />
  }
}

function useEmit(onChange: (v: TaskValue) => void, v: TaskValue) {
  useEffect(() => { onChange(v) }, [v.task, v.ready, v.missing])
}

function HealthFactor({ agentName, onChange, disabled }: { agentName: string; onChange: (v: TaskValue) => void; disabled?: boolean }) {
  const { address } = useAccount()
  const [addr, setAddr] = useState('')
  const [target, setTarget] = useState('2.5')
  useEffect(() => { if (!addr && address) setAddr(address) }, [address])
  const t = num(target)
  const addrOk = ADDR.test(addr)
  const targetOk = t !== null && t > 1 && t <= 10
  const v = useMemo<TaskValue>(() => ({
    task: hfTask(addr, t ?? 2.5),
    ready: addrOk && targetOk,
    missing: !addrOk ? 'Enter the Venus account to check.' : !targetOk ? 'Pick a target health factor above 1.' : null,
  }), [addr, t, addrOk, targetOk])
  useEmit(onChange, v)
  return (
    <div className="taskform-grid">
      <Field label="Venus account to check" kind="mono" value={addr} onChange={setAddr} placeholder="0x…" disabled={disabled}
        error={addr && !addrOk ? 'A BNB Smart Chain address starts 0x and has 40 more characters.' : null}
        help={<span className="taskform-help">{address && addr.toLowerCase() === address.toLowerCase() ? 'Your connected wallet. ' : ''}No Venus loan? <button type="button" className="taskform-link" onClick={() => setAddr(EXAMPLE_LOAN)}>Use a real account with a live loan</button></span>} />
      <Field label="Restore it to" value={target} onChange={setTarget} unit="health factor" disabled={disabled}
        error={target && !targetOk ? 'Choose a target between 1 and 10.' : null} help={`${agentName} works out the exact repay to reach this.`} />
    </div>
  )
}

const PAIRS = [{ value: 'BNB', label: 'BNB / USDT' }, { value: 'BTCB', label: 'BTCB / USDT' }, { value: 'ETH', label: 'ETH / USDT' }]

function Grid({ onChange, disabled }: { onChange: (v: TaskValue) => void; disabled?: boolean }) {
  const [pair, setPair] = useState('BNB')
  const [lo, setLo] = useState('')
  const [hi, setHi] = useState('')
  const [cap, setCap] = useState('500')
  const [stop, setStop] = useState('')
  const [levels, setLevels] = useState('10')
  const [spot, setSpot] = useState<{ price: number; block: string } | null>(null)
  useEffect(() => {
    let live = true
    setSpot(null)
    fetch(`/api/v1/spot?symbol=${pair}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (live && j && typeof j.price === 'number') setSpot({ price: j.price, block: j.blockNumber })
    }).catch(() => undefined)
    return () => { live = false }
  }, [pair])
  const L = num(lo), H = num(hi), C = num(cap), S = num(stop), N = num(levels)
  const bandOk = L !== null && H !== null && L > 0 && H > L
  const capOk = C !== null && C > 0
  const stopOk = S === null || (L !== null && S < L)
  const lvOk = N === null || (Number.isInteger(N) && N >= 2 && N <= 50)
  const v = useMemo<TaskValue>(() => ({
    task: gridTask({ pair, lower: lo, upper: hi, capital: cap, stop: S !== null ? stop : null, levels: N }),
    ready: bandOk && capOk && stopOk && lvOk,
    missing: !bandOk ? 'Set a lower and an upper price, lower first.' : !capOk ? 'Set the capital in USDT.' : !stopOk ? 'The stop must sit below the lower price.' : !lvOk ? 'Levels: a whole number from 2 to 50.' : null,
  }), [pair, lo, hi, cap, stop, N, S, bandOk, capOk, stopOk, lvOk])
  useEmit(onChange, v)
  const band = (pct: number) => { if (!spot) return; setLo(fmt(spot.price * (1 - pct))); setHi(fmt(spot.price * (1 + pct))) }
  return (
    <div className="taskform-grid">
      <SelectField label="Pair" value={pair} onChange={setPair} options={PAIRS} help={spot ? <span className="taskform-help">{pair} now {fmt(spot.price)} USDT on PancakeSwap, block {Number(spot.block).toLocaleString('en-US')}. <button type="button" className="taskform-link" onClick={() => band(0.1)}>Band ±10%</button> · <button type="button" className="taskform-link" onClick={() => band(0.05)}>±5%</button></span> : 'Reading the current price…'} />
      <Field label="Capital" value={cap} onChange={setCap} unit="USDT" disabled={disabled} error={cap && !capOk ? 'Enter an amount above 0.' : null} />
      <Field label="Lower price" value={lo} onChange={setLo} unit="USDT" disabled={disabled} error={lo && hi && !bandOk ? 'Lower must be below upper.' : null} />
      <Field label="Upper price" value={hi} onChange={setHi} unit="USDT" disabled={disabled} />
      <Field label="Stop (optional)" value={stop} onChange={setStop} unit="USDT" disabled={disabled} error={!stopOk ? 'Below the lower price.' : null} help="No level is placed at or below it." />
      <Field label="Levels" value={levels} onChange={setLevels} disabled={disabled} error={!lvOk ? 'From 2 to 50.' : null} />
    </div>
  )
}

function Rebalance({ onChange, disabled }: { onChange: (v: TaskValue) => void; disabled?: boolean }) {
  const { address } = useAccount()
  const [id, setId] = useState('')
  const [pct, setPct] = useState('5')
  const [mine, setMine] = useState<Array<{ tokenId: string; pair: string; inRange: boolean }> | null>(null)
  useEffect(() => {
    if (!address) { setMine(null); return }
    let live = true
    fetch(`/api/v1/pancakeswap/${address}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!live || !j) return
      const list = (j.positions ?? []) as Array<{ tokenId: string; pair: string; inRange: boolean }>
      setMine(list.map((p) => ({ tokenId: String(p.tokenId), pair: p.pair, inRange: Boolean(p.inRange) })))
      if (list[0] && !id) setId(String(list[0].tokenId))
    }).catch(() => setMine([]))
    return () => { live = false }
  }, [address])
  const P = num(pct)
  const idOk = /^\d{1,12}$/.test(id)
  const pctOk = P !== null && P > 0 && P <= 50
  const v = useMemo<TaskValue>(() => ({
    task: rebalanceTask(id, P ?? 5),
    ready: idOk && pctOk,
    missing: !idOk ? 'Enter the position number.' : !pctOk ? 'Pick a range width between 0 and 50%.' : null,
  }), [id, P, idOk, pctOk])
  useEmit(onChange, v)
  return (
    <div className="taskform-grid">
      <Field label="PancakeSwap V3 position" value={id} onChange={(x) => setId(x.replace(/[^0-9]/g, ''))} kind="mono" placeholder="Position number" disabled={disabled}
        help={<span className="taskform-help">
          {mine && mine.length ? <>Yours: {mine.map((p, i) => <span key={p.tokenId}>{i ? ', ' : ''}<button type="button" className="taskform-link" onClick={() => setId(p.tokenId)}>#{p.tokenId} {p.pair}{p.inRange ? '' : ' (out of range)'}</button></span>)}. </> : address && mine ? 'No V3 positions in your wallet. ' : ''}
          <button type="button" className="taskform-link" onClick={() => setId(EXAMPLE_POSITION)}>Use Marque&apos;s own live position #{EXAMPLE_POSITION}</button>
        </span>} />
      <Field label="New range" value={pct} onChange={setPct} unit="± % of price" disabled={disabled} error={pct && !pctOk ? 'Between 0 and 50.' : null} help="Bound proposes ticks on the pool's spacing; nothing moves." />
    </div>
  )
}

function Yield({ onChange, disabled }: { onChange: (v: TaskValue) => void; disabled?: boolean }) {
  const [asset, setAsset] = useState('USDT')
  const [amount, setAmount] = useState('1000')
  const A = num(amount)
  const ok = A !== null && A > 0
  const v = useMemo<TaskValue>(() => ({
    task: yieldTask(amount, asset),
    ready: ok,
    missing: ok ? null : 'Enter the amount to place.',
  }), [asset, amount, ok])
  useEmit(onChange, v)
  return (
    <div className="taskform-grid">
      <SelectField label="Asset" value={asset} onChange={setAsset} options={[{ value: 'USDT', label: 'USDT' }, { value: 'USDC', label: 'USDC' }]} />
      <Field label="Amount" value={amount} onChange={setAmount} unit={asset} disabled={disabled} error={amount && !ok ? 'Enter an amount above 0.' : null} help="Routes are ranked net of switching costs at this size." />
    </div>
  )
}

function Security({ onChange, disabled }: { onChange: (v: TaskValue) => void; disabled?: boolean }) {
  const [token, setToken] = useState('')
  const ok = ADDR.test(token)
  const v = useMemo<TaskValue>(() => ({
    task: securityTask(token),
    ready: ok,
    missing: ok ? null : 'Enter the token contract address.',
  }), [token, ok])
  useEmit(onChange, v)
  return <Field label="Token contract" kind="mono" value={token} onChange={setToken} placeholder="0x…" disabled={disabled} error={token && !ok ? 'A contract address starts 0x and has 40 more characters.' : null} />
}

function Free({ agentName, onChange, disabled }: { agentName: string; onChange: (v: TaskValue) => void; disabled?: boolean }) {
  const [text, setText] = useState('')
  const v = useMemo<TaskValue>(() => ({ task: text.trim(), ready: text.trim().length >= 12, missing: text.trim().length >= 12 ? null : 'Describe the task in a sentence.' }), [text])
  useEmit(onChange, v)
  return (
    <div className="fld">
      <label className="fld-label" htmlFor="free-task"><span>Your task for {agentName}</span></label>
      <textarea id="free-task" className="taskform-text" rows={4} maxLength={1200} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} placeholder={`Say what ${agentName} should work on, with the numbers it needs.`} />
    </div>
  )
}

/**
 * Sellers that work from numbers, not sentences (chainhelix since 28 Sep): their card's
 * example task is a JSON object. A loan-shaped example (collateral, debt, prices) gets a
 * small loan form; any other shape gets the example itself to edit, checked as JSON.
 */
type Shape = { kind: 'loan' } | { kind: 'json'; example: string }

function jsonShape(example: string | null | undefined): Shape | null {
  if (!example) return null
  try {
    const j = JSON.parse(example) as Record<string, unknown>
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null
    if ('collateral' in j && 'debt' in j && 'prices' in j) return { kind: 'loan' }
    return { kind: 'json', example: JSON.stringify(j, null, 2) }
  } catch {
    return null
  }
}

const LOAN_ASSETS = [{ value: 'BNB', label: 'BNB' }, { value: 'BTCB', label: 'BTCB' }, { value: 'ETH', label: 'ETH' }]

function Structured({ shape, category, agentName, onChange, disabled }: {
  shape: Shape; category: string | null; agentName: string; onChange: (v: TaskValue) => void; disabled?: boolean
}) {
  if (shape.kind === 'loan') return <LoanNumbers agentName={agentName} onChange={onChange} disabled={disabled} />
  return <JsonTask example={shape.example} agentName={agentName} category={category} onChange={onChange} disabled={disabled} />
}

function LoanNumbers({ agentName, onChange, disabled }: { agentName: string; onChange: (v: TaskValue) => void; disabled?: boolean }) {
  const [asset, setAsset] = useState('BNB')
  const [amount, setAmount] = useState('2')
  const [lt, setLt] = useState('0.8')
  const [debt, setDebt] = useState('600')
  const [price, setPrice] = useState('')
  const [spotBlock, setSpotBlock] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setSpotBlock(null)
    fetch(`/api/v1/spot?symbol=${asset}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (live && j && typeof j.price === 'number') { setPrice(fmt(j.price)); setSpotBlock(String(j.blockNumber ?? '')) }
    }).catch(() => undefined)
    return () => { live = false }
  }, [asset])
  const A = num(amount), T = num(lt), D = num(debt), P = num(price)
  const aOk = A !== null && A > 0
  const tOk = T !== null && T > 0 && T < 1
  const dOk = D !== null && D > 0
  const pOk = P !== null && P > 0
  const v = useMemo<TaskValue>(() => ({
    task: JSON.stringify({ collateral: { [asset]: { amount: A, liqThreshold: T } }, debt: { USDT: D }, prices: { [asset]: P, USDT: 1 } }),
    ready: aOk && tOk && dOk && pOk,
    missing: !aOk ? 'Enter the collateral amount.' : !tOk ? 'The liquidation threshold is a fraction between 0 and 1.' : !dOk ? 'Enter the USDT debt.' : !pOk ? 'Enter the collateral price.' : null,
  }), [asset, A, T, D, P, aOk, tOk, dOk, pOk])
  useEmit(onChange, v)
  return (
    <div className="taskform-grid">
      <SelectField label="Collateral" value={asset} onChange={setAsset} options={LOAN_ASSETS} help={`${agentName} works from the numbers you send, not from an address.`} />
      <Field label="Amount" value={amount} onChange={setAmount} unit={asset} disabled={disabled} error={amount && !aOk ? 'Above 0.' : null} />
      <Field label="Liquidation threshold" value={lt} onChange={setLt} disabled={disabled} error={lt && !tOk ? 'Between 0 and 1, e.g. 0.8.' : null} help="Venus shows it per market as the collateral factor." />
      <Field label="Debt" value={debt} onChange={setDebt} unit="USDT" disabled={disabled} error={debt && !dOk ? 'Above 0.' : null} />
      <Field label={`${asset} price`} value={price} onChange={setPrice} unit="USDT" disabled={disabled} error={price && !pOk ? 'Above 0.' : null}
        help={spotBlock ? `PancakeSwap spot at block ${Number(spotBlock).toLocaleString('en-US')}.` : 'Reading the current price…'} />
    </div>
  )
}

function JsonTask({ example, agentName, category, onChange, disabled }: {
  example: string; agentName: string; category: string | null; onChange: (v: TaskValue) => void; disabled?: boolean
}) {
  const [text, setText] = useState(example)
  let ok = false
  try { const j = JSON.parse(text) as unknown; ok = Boolean(j) && typeof j === 'object' && !Array.isArray(j) } catch { ok = false }
  const v = useMemo<TaskValue>(() => ({
    task: ok ? JSON.stringify(JSON.parse(text)) : text,
    ready: ok,
    missing: ok ? null : `${agentName} reads a JSON object; this one does not parse.`,
  }), [text, ok])
  useEmit(onChange, v)
  return (
    <div className="fld" data-category={category ?? undefined}>
      <label className="fld-label" htmlFor="json-task"><span>Task for {agentName}, in the shape its card asks for</span></label>
      <textarea id="json-task" className="taskform-text taskform-mono" rows={6} maxLength={2000} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} spellCheck={false} />
    </div>
  )
}
