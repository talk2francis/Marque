'use client'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { explorerAddress, explorerTx, network } from '../../../lib/network'
import { copyText } from '../../../lib/clipboard'

/** Middle truncation: keeps the head and the tail people actually compare. */
export function middle(value: string, lead = 6, tail = 4): string {
  return value.length <= lead + tail + 1 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`
}

/**
 * An address or hash with copy and an explorer link on the right network
 * (invariant 26: the chain comes from the object, never a global).
 */
export function AddressChip({ value, chainId, kind = 'address', label, lead, tail }: {
  value: string; chainId?: number | null; kind?: 'address' | 'tx'; label?: string; lead?: number; tail?: number
}) {
  const [copied, setCopied] = useState<boolean | 'failed'>(false)
  const href = chainId ? (kind === 'tx' ? explorerTx(chainId, value) : explorerAddress(chainId, value)) : ''
  const copy = async () => {
    const ok = await copyText(value)
    setCopied(ok ? true : 'failed')
    setTimeout(() => setCopied(false), 1400)
  }
  const what = kind === 'tx' ? 'transaction' : 'address'
  return (
    <span className="addr" title={value} data-copied={copied === true || undefined}>
      {label ? <span className="addr-label">{label}</span> : null}
      <span className="addr-text">{middle(value, lead ?? (kind === 'tx' ? 6 : 6), tail ?? 4)}</span>
      <button type="button" onClick={copy} aria-label={copied === true ? 'Copied' : copied === 'failed' ? 'Copy blocked by this browser: select the text instead' : `Copy ${what}`} title={copied === 'failed' ? 'Your browser blocked copying. Select the text instead.' : undefined}>{copied === true ? <Check /> : <Copy />}</button>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${what} on ${network(chainId).short.split(' · ')[0]} explorer`}><ExternalLink /></a>
      ) : null}
    </span>
  )
}

export function HashChip(props: { value: string; chainId?: number | null; label?: string }) {
  return <AddressChip {...props} kind="tx" />
}
