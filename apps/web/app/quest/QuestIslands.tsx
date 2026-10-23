'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Check, Copy, Share2 } from 'lucide-react'
import { campaignClock } from '@marque/commerce/client'
import { declaredFor, questAddress, rememberQuestAddress, setDeclared } from '../_components/campaign/store'
import { copyText } from '../../lib/clipboard'
import styles from './quest.module.css'

const ADDR = /^0x[0-9a-fA-F]{40}$/

/** "I registered this wallet": kept in this browser only, shown as Declared, never green. */
export function DeclaredTick({ address, formUrl }: { address: string; formUrl: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => { setOn(declaredFor(address)) }, [address])
  return (
    <div className={styles.declared}>
      <label className={styles.tick}>
        <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setDeclared(address, e.target.checked) }} />
        <span>I registered this wallet</span>
        <span className={styles.declaredState} data-on={on || undefined}>{on ? 'Declared by you' : 'Marque cannot see the form'}</span>
      </label>
      <a className="btn btn--sm" href={formUrl} target="_blank" rel="noreferrer">Open the form<ArrowUpRight aria-hidden="true" /></a>
    </div>
  )
}

export function ShareProgress({ address, agents, build }: { address: string; agents: number; build: number }) {
  const [copied, setCopied] = useState(false)
  const url = `https://marque.trade/quest/${address}`
  const [days, setDays] = useState<number | null>(null)
  useEffect(() => { setDays(campaignClock(Date.now()).days) }, [])
  const left = days === null ? '' : days > 0 ? `, ${days} day${days === 1 ? '' : 's'} left` : ''
  const text = `Tracking my BNB Chain Set and Earn progress on Marque: ${agents} of 3 hires, ${build} of 6 build criteria${left}. Check yours:`
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
  return (
    <div className={styles.share}>
      <button type="button" className="btn btn--sm" onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 2000) } }}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? 'Link copied' : 'Copy link'}
      </button>
      <a className="btn btn--sm" href={x} target="_blank" rel="noreferrer"><Share2 aria-hidden="true" />Post on X</a>
    </div>
  )
}

/** Paste any address, or use the one this browser checked or connected last. No signature. */
export function QuestChecker({ initial }: { initial?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initial ?? '')
  const [remembered, setRemembered] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setRemembered(questAddress()) }, [])
  const go = (addr: string) => {
    const a = addr.trim()
    if (!ADDR.test(a)) { setError('That is not a wallet address. It starts with 0x and has 40 more characters.'); return }
    setError(null)
    rememberQuestAddress(a)
    router.push(`/quest/${a}`)
  }
  return (
    <form className={styles.checker} onSubmit={(e) => { e.preventDefault(); go(value) }} role="search" aria-label="Check a wallet">
      <label className={styles.checkerLabel} htmlFor="quest-address">Check any wallet</label>
      <div className={styles.checkerRow}>
        <input id="quest-address" className={styles.checkerInput} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0x… paste an address" spellCheck={false} autoComplete="off" inputMode="text" aria-invalid={error ? true : undefined} aria-describedby="quest-address-hint" />
        <button type="submit" className="btn btn--primary">Check</button>
      </div>
      <p id="quest-address-hint" className={styles.checkerHint} role={error ? 'alert' : undefined}>
        {error ?? <>No signature, nothing is sent.{remembered && remembered.toLowerCase() !== value.trim().toLowerCase() ? <> <button type="button" className={styles.linkBtn} onClick={() => go(remembered)}>Use {remembered.slice(0, 6)}…{remembered.slice(-4)}</button></> : null}</>}
      </p>
    </form>
  )
}
