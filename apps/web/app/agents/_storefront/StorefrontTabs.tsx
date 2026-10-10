'use client'
import { useState, type ReactNode } from 'react'
import styles from './activity.module.css'
export function StorefrontTabs({children,activity}:{children:ReactNode;activity:ReactNode}) {
  const [active,setActive]=useState<'overview'|'activity'>('overview')
  return <>
    <div className={styles.tabs} role="tablist" aria-label="Agent information">
      {(['overview','activity'] as const).map((tab,index)=><button key={tab} type="button" role="tab" id={`agent-tab-${tab}`}
        aria-controls={`agent-panel-${tab}`} aria-selected={active===tab} tabIndex={active===tab?0:-1}
        onClick={()=>setActive(tab)} onKeyDown={e=>{
          if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
            e.preventDefault();const next=e.key==='Home'?'overview':e.key==='End'?'activity':index===0?'activity':'overview'
            setActive(next);document.getElementById(`agent-tab-${next}`)?.focus()
          }
        }}>{tab==='overview'?'Overview':'Activity'}</button>)}
    </div>
    <div role="tabpanel" id="agent-panel-overview" aria-labelledby="agent-tab-overview" hidden={active!=='overview'}>{children}</div>
    <div role="tabpanel" id="agent-panel-activity" aria-labelledby="agent-tab-activity" hidden={active!=='activity'}>{activity}</div>
  </>
}
