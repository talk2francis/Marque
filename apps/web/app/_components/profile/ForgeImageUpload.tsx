'use client'
import { useState } from 'react'
import { useSignMessage } from 'wagmi'
import { ImagePlus } from 'lucide-react'
import { ImageCropper } from './ImageCropper'
import { ProfileError, readSession, signInProfile, uploadImage } from '../../../lib/profile-client'
import styles from './profile.module.css'

/**
 * The Forge's "upload instead": frame an image from this device and Marque hosts it at a permanent URL, which goes
 * into the registration file's `image` field, so the portrait is on chain with the agent from its first block.
 */
export function ForgeImageUpload({ address, onUrl }: { address: string | null; onUrl: (url: string) => void }) {
  const { signMessageAsync } = useSignMessage()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) return <button type="button" className={styles.linkBtn} style={{ color: 'var(--ink-2)', justifySelf: 'start' }} onClick={() => setOpen(true)}><ImagePlus aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 5 }} />Or upload an image from this device</button>
  if (!address) return <p className={styles.fine}>Connect the wallet you will register with, then upload: the image is stored under that wallet.</p>
  const upload = async (dataUrl: string) => {
    setBusy(true); setError(null)
    try {
      if (!readSession(address)) await signInProfile(address, (message) => signMessageAsync({ message }))
      const r = await uploadImage(address, dataUrl)
      onUrl(`${window.location.origin}${r.url}`)
      setOpen(false)
    } catch (e) {
      setError(e instanceof ProfileError ? e.message : /reject|denied|cancel/i.test(String((e as Error)?.message)) ? 'You cancelled the signature. Nothing was uploaded.' : 'Something went wrong. Try again.')
    } finally { setBusy(false) }
  }
  return (
    <div className={styles.uploadPane}>
      <ImageCropper onCropped={upload} busy={busy} cta="Upload and use" round={false} />
      <p className={styles.fine}>Uploading asks for one signature the first time (no transaction, no gas). The URL fills the Image URL field above.</p>
      {error ? <p className={styles.err} role="alert">{error}</p> : null}
    </div>
  )
}
