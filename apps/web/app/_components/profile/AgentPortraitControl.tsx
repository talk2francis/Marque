'use client'
import { useState } from 'react'
import { useSignMessage } from 'wagmi'
import { Check, Copy, ImagePlus } from 'lucide-react'
import { ImageCropper } from './ImageCropper'
import { ProfileError, readSession, setAgentPortrait, signInProfile, uploadImage } from '../../../lib/profile-client'
import { copyText } from '../../../lib/clipboard'
import { toast } from '../../../lib/toast'
import styles from './profile.module.css'

/**
 * Give an agent you own a portrait (28 Oct): upload a PNG, JPEG or WebP, frame it, and it shows on the agent's card
 * and page on Marque at once. Ownership is re-read on chain when it is set. The image gets a permanent URL, which can
 * go in the registration file's `image` field to carry it everywhere ERC-8004 is read.
 */
export function AgentPortraitControl({ owner, agentId, hasPortrait, onChanged }: { owner: string; agentId: string; hasPortrait: boolean; onChanged: (url: string | null) => void }) {
  const { signMessageAsync } = useSignMessage()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hosted, setHosted] = useState<string | null>(null)

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(null)
    try {
      if (!readSession(owner)) await signInProfile(owner, (message) => signMessageAsync({ message }))
      await work()
    } catch (e) {
      setError(e instanceof ProfileError ? e.message : /reject|denied|cancel/i.test(String((e as Error)?.message)) ? 'You cancelled the signature. Nothing changed.' : 'Something went wrong. Try again.')
    } finally { setBusy(false) }
  }

  const upload = (dataUrl: string) => run(async () => {
    const img = await uploadImage(owner, dataUrl)
    await setAgentPortrait(owner, agentId, img.id)
    const url = `${window.location.origin}${img.url}`
    setHosted(url); onChanged(img.url)
    toast({ tone: 'success', title: 'Portrait set', body: 'It shows on the agent’s card and page on Marque now.' })
  })
  const clear = () => run(async () => {
    await setAgentPortrait(owner, agentId, null)
    setHosted(null); onChanged(null)
    toast({ tone: 'success', title: 'Portrait removed', body: 'The registry image, or the Marque mark, shows again.' })
  })

  if (!open) {
    return <button type="button" className={styles.linkBtn} style={{ color: 'var(--ink-2)' }} onClick={() => setOpen(true)}><ImagePlus aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 5 }} />{hasPortrait ? 'Change portrait' : 'Add a portrait'}</button>
  }
  return (
    <div className={styles.uploadPane} style={{ width: '100%', paddingTop: 8 }}>
      {hosted ? (
        <div className={styles.block}>
          <p className={styles.ok}><Check aria-hidden="true" />Portrait set.</p>
          <p className={styles.fine}>To carry it beyond Marque, put this URL in the agent’s registration file as <code>image</code>:</p>
          <button type="button" className={styles.recut} onClick={async () => { if (await copyText(hosted)) toast({ tone: 'success', title: 'URL copied' }) }}><Copy aria-hidden="true" />{hosted.replace(/^https?:\/\//, '')}</button>
        </div>
      ) : <ImageCropper onCropped={upload} busy={busy} cta="Set as portrait" round={false} />}
      <div className={styles.cropActions}>
        {hasPortrait && !hosted ? <button type="button" className="btn btn--sm btn--secondary" onClick={clear} disabled={busy}>Remove portrait</button> : null}
        <button type="button" className={styles.linkBtn} onClick={() => { setOpen(false); setHosted(null); setError(null) }}>Close</button>
      </div>
      {error ? <p className={styles.err} role="alert">{error}</p> : null}
    </div>
  )
}
