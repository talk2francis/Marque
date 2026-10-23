'use client'
import { useState } from 'react'
import { Copy } from 'lucide-react'
import { copyText } from '../../lib/clipboard'
import { toast } from '../../lib/toast'
import styles from './forge.module.css'

/**
 * Launch kit and README badge (SPEC-BUILDERS 7): three short posts built only from the measured facts
 * passed in, the listing and hire links, and a live badge in light and dark. No em dashes; each post
 * stays under 260 characters with its link.
 */
export function LaunchKit({ agentId, chainId, tokenId, name, category, priceLabel, warrant, base = 'https://marque.trade' }: {
  agentId: string; chainId: 56 | 97; tokenId: string; name: string; category: string | null; priceLabel: string | null; warrant: string | null; base?: string
}) {
  const page = `${base}/agents/${chainId}/${tokenId}`
  const hire = `${page}?hire=${encodeURIComponent(agentId)}`
  const cat = category ? category.replace('_', ' ') : 'BNB Chain'
  const net = chainId === 97 ? ' on BSC testnet (free to try)' : ' on BNB Chain'
  const posts = [
    `${name} is live${net}: ${cat} answers you can check, paid through BNB Chain's escrow${priceLabel ? ` at ${priceLabel} a job` : ''}. ${page}`,
    `Looking for ${name}'s first hire. Send it a ${cat} task, see the answer, and rate it on chain. Payment waits in escrow until it delivers. ${hire}`,
    warrant ? `${name} passed Marque's ${warrant} test: every checked number matched the chain at a pinned block. The record is public: ${page}/evidence` : `${name}'s test results and probe history are public, failures included: ${page}/evidence`,
  ].map((p) => (p.length > 260 ? `${p.slice(0, 257 - page.length)}... ${page}` : p))
  const badge = `${base}/badge/${chainId}/${tokenId}.svg`
  const md = `[![${name} on Marque](${badge})](${page})`
  const html = `<a href="${page}"><picture><source media="(prefers-color-scheme: dark)" srcset="${badge}?theme=dark"><img alt="${name} on Marque" src="${badge}"></picture></a>`
  return (
    <section className={styles.launch} aria-labelledby="launch-title">
      <h2 id="launch-title">Launch kit</h2>
      <ol className={styles.posts}>{posts.map((p, i) => <Snippet key={i} label={['Launch', 'Ask for a first hire', 'Evidence'][i]!} text={p} count />)}</ol>
      <div className={styles.badgeRow}>
        <div className={styles.badgeShow}>
          <img src={`/badge/${chainId}/${tokenId}.svg`} alt={`${name} badge, light`} height={20} />
          <span className={styles.badgeDark}><img src={`/badge/${chainId}/${tokenId}.svg?theme=dark`} alt={`${name} badge, dark`} height={20} /></span>
        </div>
        <Snippet label="README badge (Markdown)" text={md} />
        <Snippet label="README badge (follows light and dark)" text={html} />
        <Snippet label="Listing" text={page} />
        <Snippet label="Hire link" text={hire} />
      </div>
    </section>
  )
}

function Snippet({ label, text, count = false }: { label: string; text: string; count?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <div className={styles.snippet}>
      <div className={styles.snippetHead}>
        <span>{label}{count ? <span className={styles.chars}> · {text.length} characters</span> : null}</span>
        <button type="button" onClick={async () => { if (await copyText(text)) { setDone(true); toast({ tone: 'success', title: `${label} copied` }); setTimeout(() => setDone(false), 1500) } }}><Copy aria-hidden="true" />{done ? 'Copied' : 'Copy'}</button>
      </div>
      <p className={styles.snippetText}>{text}</p>
    </div>
  )
}
