'use client'
import { useState } from 'react'
import { Button } from '../../_components/ui'
import styles from '../forge.module.css'

/** Which identity: network and agent number, then the link step for it. */
export function LinkPicker() {
  const [chain, setChain] = useState<'56' | '97'>('97')
  const [token, setToken] = useState('')
  const ok = /^\d{1,12}$/.test(token.trim())
  return (
    <form className={styles.panel} onSubmit={(e) => { e.preventDefault(); if (ok) window.location.href = `/builders/link?chain=${chain}&token=${token.trim()}` }}>
      <div className={styles.fields}>
        <label>Network<select value={chain} onChange={(e) => setChain(e.target.value as '56' | '97')}><option value="97">BSC testnet</option><option value="56">BSC mainnet</option></select></label>
        <label>Agent number<input value={token} onChange={(e) => setToken(e.target.value)} inputMode="numeric" placeholder="2661" /></label>
      </div>
      <div className={styles.actions}><Button type="submit" variant="primary" disabled={!ok}>Continue</Button></div>
    </form>
  )
}
