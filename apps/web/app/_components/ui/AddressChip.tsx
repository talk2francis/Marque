'use client'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { explorerAddress, explorerTx, network } from '../../../lib/network'

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
  const [copied, setCopied] = useState(false)
  const href = chainId ? (kind === 'tx' ? explorerTx(chainId, value) : explorerAddress(chainId, value)) : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* clipboard refused */ }
  }
  const what = kind === 'tx' ? 'transaction' : 'address'
  return (
    <span className="addr" title={value} data-copied={copied || undefined}>
      {label ? <span className="addr-label">{label}</span> : null}
      <span className="addr-text">{middle(value, lead ?? (kind === 'tx' ? 6 : 6), tail ?? 4)}</span>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${what}`}>{copied ? <Check /> : <Copy />}</button>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${what} on ${network(chainId).short.split(' · ')[0]} explorer`}><ExternalLink /></a>
      ) : null}
    </span>
  )
}

export function HashChip(props: { value: string; chainId?: number | null; label?: string }) {
  return <AddressChip {...props} kind="tx" />
}
