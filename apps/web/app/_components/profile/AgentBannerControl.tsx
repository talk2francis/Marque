'use client'
import { useEffect, useState } from 'react'
import { useSignMessage } from 'wagmi'
import { BRAND } from '@marque/ui/brand'
import { ArrowUpRight, ImagePlus, X } from 'lucide-react'
import { BannerCropper } from './BannerCropper'
import { fetchAgentBanner, ProfileError, readSession, saveAgentBannerImage, signInProfile, signOutProfile } from '../../../lib/profile-client'
import { hostedBannerUrl, type AgentBanner } from '../../../lib/agent-banner-model'
import { toast } from '../../../lib/toast'
import styles from './banner.module.css'

/** Optional presentation, after listing. Every save and removal rechecks ownership on the server. */
export function AgentBannerControl({ owner, agentId }: { owner: string; agentId: string }) {
  const { signMessageAsync } = useSignMessage()
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<AgentBanner | null>(null), [error, setError] = useState<string | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [saved, setSaved] = useState(false), [attempt, setAttempt] = useState(0)
  useEffect(() => { setOpen(false); setBanner(null); setError(null); setSaved(false) }, [owner, agentId])
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true); setError(null); setBanner(null); setReadFailed(false)
    void fetchAgentBanner(agentId, controller.signal).then(value => { if (!controller.signal.aborted) setBanner(value) }).catch(() => { if (!controller.signal.aborted) { setReadFailed(true); setError('The current banner could not be read. Try again before changing it.') } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, agentId, attempt])
  const save = async (dataUrl: string | null) => {
    setBusy(true); setError(null)
    try {
      if (!readSession(owner)) await signInProfile(owner, message => signMessageAsync({ message }))
      const next = await saveAgentBannerImage(owner, agentId, dataUrl)
      setBanner(next); setSaved(true)
      toast({ tone: 'success', title: next ? 'Banner saved' : 'Banner removed', body: next ? `It now appears at the top of this agent’s profile on ${BRAND.name}.` : 'This agent uses the default profile header again.' })
    } catch (e) { if (e instanceof ProfileError && e.status === 401) signOutProfile(owner); setError(e instanceof ProfileError ? e.message : /reject|denied|cancel/i.test(String(e)) ? 'You cancelled the signature. The banner was not saved.' : 'The banner could not be confirmed. Try again.') }
    finally { setBusy(false) }
  }
  if (!open) return <button type="button" className={`btn ${styles.open}`} onClick={() => { setOpen(true); setSaved(false) }}><ImagePlus aria-hidden="true" />Hero banner</button>
  const url = hostedBannerUrl(banner?.url), parts = agentId.split(':')
  return <section className={styles.editor} aria-label="Agent hero banner">
    <header><div><h4>Hero banner</h4><p>Optional artwork at the top of your agent&apos;s profile. Your portrait stays separate.</p></div><button type="button" className={styles.close} aria-label="Close banner editor" disabled={busy} onClick={() => setOpen(false)}><X aria-hidden="true" /></button></header>
    {loading ? <p role="status">Reading your banner...</p> : <>
      {url ? <figure className={styles.existing}><img src={url} alt="Your agent’s current hero banner" width={960} height={320} /><figcaption>{saved ? `Saved on ${BRAND.name}.` : `Current banner on ${BRAND.name}.`}</figcaption></figure> : saved ? <p role="status">Banner removed. The default profile header is back.</p> : !error ? <p>No banner yet. Your agent keeps the default header until you choose one.</p> : null}
      {!saved && !readFailed ? <BannerCropper busy={busy} onSave={value => void save(value)} /> : null}
      <div className={styles.actions}>
        {saved ? <button type="button" className="btn" disabled={busy} onClick={() => setSaved(false)}>{banner ? 'Choose another banner' : 'Add a banner'}</button> : null}
        {url ? <button type="button" className="btn" disabled={busy} onClick={() => void save(null)}>Remove banner</button> : null}
        {saved ? <a className="btn" href={`/agents/${parts[0]}/${parts[2]}`}>View agent profile <ArrowUpRight aria-hidden="true" /></a> : null}
      </div>
    </>}
    {error ? <p role="alert" className={styles.error}>{error} {readFailed ? <button type="button" className="btn" disabled={busy} onClick={() => { setSaved(false); setAttempt(v => v + 1) }}>Read again</button> : null}</p> : null}
    <p className={styles.note}>Saved on {BRAND.name} only. A wallet signature may be needed; no transaction or gas fee. This does not change your listing checks.</p>
  </section>
}
