'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSignMessage } from 'wagmi'
import { Check, Gem, ImageUp, RefreshCw, Bot } from 'lucide-react'
import { Sheet } from '../ui'
import { AgentAvatar } from '../AgentAvatar'
import { FacetAvatar } from './FacetAvatar'
import { ProfileAvatar } from './ProfileAvatar'
import { ImageCropper } from './ImageCropper'
import { ACCENTS, DEFAULT_PREFS, type Accent, type AvatarChoice, type Prefs, type WalletProfile } from '../../../lib/profile-model'
import { applyPrefs, deleteProfile, ProfileError, readSession, saveProfile, signInProfile, uploadImage } from '../../../lib/profile-client'
import { toast } from '../../../lib/toast'
import styles from './profile.module.css'

/**
 * Edit a wallet's profile (28 Oct): its portrait, its name and line, whether others see it, and how Marque behaves
 * for its owner. Saving asks for one signature the first time in a browser (no transaction, no gas); after that the
 * session lasts seven days. Preferences apply the moment they are saved, on every device signed in.
 */
type Mode = 'stone' | 'upload' | 'agent'
interface OwnedAgent { agentKey: string; name: string; imageUrl?: string | null; chainId: number }

const ACCENT_LABEL: Record<Accent, string> = { champagne: 'Champagne', graphite: 'Graphite', porcelain: 'Porcelain', moss: 'Moss', oxide: 'Oxide', tide: 'Tide' }

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className={styles.pref}>
      <span className={styles.prefLabel}>{label}</span>
      <div className={styles.seg} role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} data-on={value === v || undefined} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  )
}

export function ProfileEditor({ address, profile, open, onClose }: { address: string; profile: WalletProfile; open: boolean; onClose: () => void }) {
  const { signMessageAsync } = useSignMessage()
  const [name, setName] = useState(profile.displayName ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [avatar, setAvatar] = useState<AvatarChoice>(profile.avatar)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl)
  const [accent, setAccent] = useState<Accent>(profile.accent)
  const [shown, setShown] = useState(profile.public)
  const [prefs, setPrefs] = useState<Prefs>(profile.prefs ?? DEFAULT_PREFS)
  const [mode, setMode] = useState<Mode>(profile.avatar.kind === 'upload' ? 'upload' : profile.avatar.kind === 'agent' ? 'agent' : 'stone')
  const [base, setBase] = useState(profile.avatar.kind === 'facet' ? profile.avatar.seed : 0)
  const [agents, setAgents] = useState<OwnedAgent[] | null>(null)
  const [busy, setBusy] = useState<null | 'upload' | 'save' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Re-seed the form whenever the sheet opens on a fresh profile.
  useEffect(() => {
    if (!open) return
    setName(profile.displayName ?? ''); setBio(profile.bio ?? ''); setAvatar(profile.avatar); setAvatarUrl(profile.avatarUrl)
    setAccent(profile.accent); setShown(profile.public); setPrefs(profile.prefs ?? DEFAULT_PREFS); setError(null); setConfirmDelete(false)
    setMode(profile.avatar.kind === 'upload' ? 'upload' : profile.avatar.kind === 'agent' ? 'agent' : 'stone')
    setBase(profile.avatar.kind === 'facet' ? profile.avatar.seed : 0)
  }, [open, profile])

  useEffect(() => {
    if (!open || mode !== 'agent' || agents !== null) return
    fetch(`/api/v1/phase2/owner/${address}`).then((r) => (r.ok ? r.json() : null)).then((j: { agents?: OwnedAgent[] } | null) => setAgents(j?.agents ?? [])).catch(() => setAgents([]))
  }, [open, mode, agents, address])

  const seeds = useMemo(() => Array.from({ length: 8 }, (_, i) => (base + i * 977) % 10000), [base])
  const preview: WalletProfile = { ...profile, avatar, avatarUrl: avatar.kind === 'facet' ? null : avatarUrl, accent }

  /** Signs in once when this browser has no session for the wallet. */
  const ensureSession = async () => {
    if (readSession(address)) return
    await signInProfile(address, (message) => signMessageAsync({ message }))
  }
  const fail = (e: unknown) => {
    const m = e instanceof ProfileError ? e.message : /reject|denied|cancel/i.test(String((e as Error)?.message)) ? 'You cancelled the signature. Nothing was saved.' : 'Something went wrong. Try again.'
    setError(m)
  }

  const upload = async (dataUrl: string) => {
    setBusy('upload'); setError(null)
    try {
      await ensureSession()
      const r = await uploadImage(address, dataUrl)
      setAvatar({ kind: 'upload', image: r.id }); setAvatarUrl(r.url)
    } catch (e) { fail(e) } finally { setBusy(null) }
  }

  const save = async () => {
    setBusy('save'); setError(null)
    try {
      await ensureSession()
      const saved = await saveProfile(address, { displayName: name.trim() || null, bio: bio.trim() || null, avatar, accent, prefs, public: shown })
      applyPrefs(saved.prefs ?? prefs)
      toast({ tone: 'success', title: 'Profile saved', body: shown ? 'Your name and portrait now show on Marque.' : 'Saved privately: only you see it, when signed in.' })
      onClose()
    } catch (e) { fail(e) } finally { setBusy(null) }
  }

  const remove = async () => {
    setBusy('delete'); setError(null)
    try {
      await ensureSession()
      await deleteProfile(address)
      toast({ tone: 'success', title: 'Profile deleted', body: 'Your address shows its own stone again. Your uploads are gone.' })
      onClose()
    } catch (e) { fail(e) } finally { setBusy(null) }
  }

  const signedIn = Boolean(readSession(address))
  return (
    <Sheet open={open} onClose={onClose} label="Edit your profile" title={<span className="t-label">Your profile</span>}
      footer={
        <div className={styles.foot}>
          {error ? <p className={styles.err} role="alert">{error}</p> : <p className={styles.fine}>{signedIn ? 'Signed in on this browser.' : 'Saving asks for one signature: no transaction, no gas.'}</p>}
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy !== null}>{busy === 'save' ? 'Saving…' : signedIn ? 'Save profile' : 'Sign and save'}</button>
        </div>
      }>
      <div className={styles.editor}>
        <section className={styles.block} aria-labelledby="pf-portrait">
          <div className={styles.portraitHead}>
            <ProfileAvatar address={address} profile={preview} size={84} label="Your portrait" />
            <div>
              <h3 id="pf-portrait" className={styles.h}>Portrait</h3>
              <p className={styles.fine}>Your own stone, cut from your address, an image of your own, or one of your agents.</p>
            </div>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="Portrait source">
            {([['stone', 'Stone', Gem], ['upload', 'Upload', ImageUp], ['agent', 'My agents', Bot]] as const).map(([m, l, Icon]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} data-on={mode === m || undefined} onClick={() => setMode(m)}><Icon aria-hidden="true" />{l}</button>
            ))}
          </div>
          {mode === 'stone' ? (
            <div className={styles.stones}>
              <div className={styles.stoneGrid} role="radiogroup" aria-label="Stone">
                {seeds.map((s) => {
                  const on = avatar.kind === 'facet' && avatar.seed === s
                  return <button key={s} type="button" role="radio" aria-checked={on} data-on={on || undefined} onClick={() => setAvatar({ kind: 'facet', seed: s })} aria-label={`Stone ${s}`}><FacetAvatar address={address} seed={s} accent={accent} size={52} /></button>
                })}
              </div>
              <button type="button" className={styles.recut} onClick={() => setBase((b) => (b + 7919) % 10000)}><RefreshCw aria-hidden="true" />Re-cut</button>
              <div className={styles.swatches} role="radiogroup" aria-label="Accent">
                {ACCENTS.map((a) => <button key={a} type="button" role="radio" aria-checked={accent === a} data-on={accent === a || undefined} data-accent={a} onClick={() => setAccent(a)} title={ACCENT_LABEL[a]}><span className={styles.swatchDot} />{ACCENT_LABEL[a]}</button>)}
              </div>
            </div>
          ) : mode === 'upload' ? (
            <div className={styles.uploadPane}>
              {avatar.kind === 'upload' ? <p className={styles.ok}><Check aria-hidden="true" />Your image is uploaded. Save to use it, or choose another.</p> : null}
              <ImageCropper onCropped={upload} busy={busy === 'upload'} cta="Upload this" />
            </div>
          ) : (
            <div className={styles.agentPick}>
              {agents === null ? <p className={styles.fine}>Reading your agents…</p>
                : !agents.length ? <p className={styles.fine}>This wallet owns no agents yet. <a href="/builders">Build one in the Forge</a>.</p>
                  : (
                    <ul role="radiogroup" aria-label="Agent portrait">
                      {agents.map((a) => {
                        const on = avatar.kind === 'agent' && avatar.agentId === a.agentKey
                        return (
                          <li key={a.agentKey}>
                            <button type="button" role="radio" aria-checked={on} data-on={on || undefined} onClick={() => { setAvatar({ kind: 'agent', agentId: a.agentKey }); setAvatarUrl(a.imageUrl ?? null) }}>
                              <AgentAvatar id={a.agentKey} reference={false} imageUrl={a.imageUrl ?? null} size={40} />
                              <span><b>{a.name}</b><small>{a.chainId === 56 ? 'Mainnet' : 'Testnet'}{a.imageUrl ? '' : ' · no image yet'}</small></span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
            </div>
          )}
        </section>

        <section className={styles.block} aria-labelledby="pf-name">
          <h3 id="pf-name" className={styles.h}>Name and line</h3>
          <label className={styles.field}>Display name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Shown instead of your address" autoComplete="nickname" /><small>{name.length}/40</small></label>
          <label className={styles.field}>A line about you<textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={2} placeholder="What you hire agents for, or what you build" /><small>{bio.length}/160 · plain text, no links</small></label>
          <label className={styles.check}><input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} /><span><b>Show my profile to others</b><small>On your public page and beside your address. Off: only you see it, when signed in.</small></span></label>
        </section>

        <section className={styles.block} aria-labelledby="pf-prefs">
          <h3 id="pf-prefs" className={styles.h}>Preferences</h3>
          <Segmented label="Theme" value={prefs.theme} options={[['night', 'Night'], ['day', 'Day'], ['system', 'Follow device']]} onChange={(theme) => setPrefs({ ...prefs, theme })} />
          <Segmented label="Motion" value={prefs.motion} options={[['full', 'Full'], ['calm', 'Calm']]} onChange={(motion) => setPrefs({ ...prefs, motion })} />
          <Segmented label="Faceted background" value={prefs.ambient ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => setPrefs({ ...prefs, ambient: v === 'on' })} />
          <Segmented label="Marketplace opens on" value={prefs.lane} options={[['all', 'Both networks'], ['mainnet', 'Mainnet'], ['practice', 'Testnet']]} onChange={(lane) => setPrefs({ ...prefs, lane })} />
          <p className={styles.fine}>Saved to your profile, so they follow you to any device you sign in on.</p>
        </section>

        {profile.saved ? (
          <section className={styles.danger}>
            {confirmDelete ? (
              <>
                <p>Delete your profile and your uploaded images? Agent portraits you set stay until you change them.</p>
                <div className={styles.cropActions}>
                  <button type="button" className="btn btn--sm btn--secondary" onClick={() => setConfirmDelete(false)}>Keep it</button>
                  <button type="button" className="btn btn--sm btn--danger" onClick={remove} disabled={busy !== null}>{busy === 'delete' ? 'Deleting…' : 'Delete profile'}</button>
                </div>
              </>
            ) : <button type="button" className={styles.linkBtn} onClick={() => setConfirmDelete(true)}>Delete my profile</button>}
          </section>
        ) : null}
      </div>
    </Sheet>
  )
}

