'use client'

import { useState } from 'react'
import { parseUnits } from 'viem'
import { Button } from '@marque/ui'
import type { CharterTemplate } from '../../../lib/charter-templates'
import { scanAddress } from '../../../lib/charter-templates'
import styles from './charter.module.css'

export function PolicyPreview({ template }: { template: CharterTemplate }) {
  const [cap, setCap] = useState(template.defaultCapBnb)
  const [minutes, setMinutes] = useState(String(template.defaultMinutes))
  const [reviewed, setReviewed] = useState(false)
  const valid = cap.length <= 64 && /^\d+(\.\d{1,18})?$/.test(cap) && parseUnits(cap, 18) > 0n && parseUnits(cap, 18) <= 50_000_000_000_000_000n
    && /^\d+$/.test(minutes) && Number(minutes) >= 5 && Number(minutes) <= 1440
  return <div className={styles.desk}>
    <p className={styles.actNote}>Proposed scope only. Account ownership, token limits, recipients and onchain enforcement have not been verified.</p>
    <div className={styles.columns}>
      <section className={styles.column}>
        <h2 className={styles.columnHead}>Proposed operations</h2>
        <ul className={styles.list}>{template.calls.map(call => <li className={styles.item} key={call.to}>
          <div className={styles.itemText}><a href={scanAddress(call.to)} target="_blank" rel="noreferrer noopener">{call.contract}</a>
            <ul>{call.may.map(text => <li key={text}>{text}</li>)}</ul>
            <details><summary>Exact proposed functions</summary><code>{call.selectors.join(', ')}</code></details>
          </div>
        </li>)}</ul>
      </section>
      <section className={styles.column}>
        <h2 className={styles.columnHead}>Still needed before any action</h2>
        <ul className={styles.list}>{[
          'Proof that you control the account and the exact agent service.',
          'A permitted recipient and an exact limit for every token being moved.',
          'A current onchain permission check, simulation and your wallet approval.',
          'A proven revocation path and a fresh state check before signing.',
        ].map(text => <li className={styles.item} key={text}>{text}</li>)}</ul>
      </section>
    </div>
    <div className={styles.controls}>
      <label className={styles.field}><span className={styles.fieldLabel}>Proposed native-token limit</span>
        <span className={styles.inputRow}><input className={styles.input} inputMode="decimal" value={cap} onChange={e => { setCap(e.target.value); setReviewed(false) }} /><span className={styles.unit}>tBNB</span></span>
        <span className={styles.fieldNote}>This does not cap USDT or other token movements. No transaction or relay fee is estimated.</span>
      </label>
      <label className={styles.field}><span className={styles.fieldLabel}>Proposed lifetime</span>
        <span className={styles.inputRow}><input className={styles.input} inputMode="numeric" value={minutes} onChange={e => { setMinutes(e.target.value); setReviewed(false) }} /><span className={styles.unit}>minutes</span></span>
        <span className={styles.fieldNote}>No permission has been created and no expiry clock is running.</span>
      </label>
    </div>
    <div className={styles.act}><Button variant="primary" disabled={!valid} onClick={() => setReviewed(true)}>Review proposed limits</Button></div>
    {!valid && <p role="alert" className={styles.error}>Choose a positive limit up to 0.05 tBNB and a lifetime from 5 to 1440 minutes.</p>}
    {reviewed && <p role="status">Limits reviewed locally: {cap} tBNB and {minutes} minutes. No wallet opened, no transaction sent and no authority granted.</p>}
  </div>
}
