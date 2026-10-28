'use client'
import { useEffect, useRef, useState } from 'react'
import { ImageUp } from 'lucide-react'
import styles from './profile.module.css'

/**
 * Choose an image from this device and frame it: drag to place, slide to zoom. The browser redraws the square at
 * 512 px, which also drops anything the original file carried besides pixels (camera and location data).
 * Nothing leaves the device until the owner presses the button.
 */
const VIEW = 240
const OUT = 512

export function ImageCropper({ onCropped, busy, cta = 'Use this image', round = true }: { onCropped: (dataUrl: string) => void; busy?: boolean; cta?: string; round?: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [error, setError] = useState<string | null>(null)
  const img = useRef<HTMLImageElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])

  const scale = nat ? (VIEW / Math.min(nat.w, nat.h)) * zoom : 1
  const W = nat ? nat.w * scale : VIEW, H = nat ? nat.h * scale : VIEW
  const clamp = (p: { x: number; y: number }) => ({ x: Math.min(0, Math.max(VIEW - W, p.x)), y: Math.min(0, Math.max(VIEW - H, p.y)) })
  // Keep the frame filled when the zoom changes.
  useEffect(() => { setPos((p) => clamp(p)) }, [zoom, nat])

  const pick = (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setError('Choose a PNG, JPEG or WebP image.'); return }
    if (f.size > 12_000_000) { setError('That file is over 12 MB. Choose a smaller image.'); return }
    if (src) URL.revokeObjectURL(src)
    setSrc(URL.createObjectURL(f)); setNat(null); setZoom(1)
  }

  const done = () => {
    if (!img.current || !nat) return
    const c = document.createElement('canvas')
    c.width = OUT; c.height = OUT
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img.current, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT)
    // WebP where the browser can write it; otherwise the browser falls back to PNG on its own.
    onCropped(c.toDataURL('image/webp', 0.9))
  }

  return (
    <div className={styles.cropper}>
      {src ? (
        <>
          <div
            className={styles.cropView} data-round={round || undefined} style={{ width: VIEW, height: VIEW }}
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y } }}
            onPointerMove={(e) => { const d = drag.current; if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y })) }}
            onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
          >
            <img
              ref={img} src={src} alt="" draggable={false}
              onLoad={(e) => { const t = e.currentTarget; const n = { w: t.naturalWidth, h: t.naturalHeight }; setNat(n); const s = VIEW / Math.min(n.w, n.h); setPos({ x: (VIEW - n.w * s) / 2, y: (VIEW - n.h * s) / 2 }) }}
              onError={() => { setError('That image could not be read. Try another file.'); setSrc(null) }}
              style={{ width: W, height: H, transform: `translate(${pos.x}px, ${pos.y}px)` }}
            />
          </div>
          <label className={styles.zoom}>Zoom
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
          </label>
          <div className={styles.cropActions}>
            <label className="btn btn--sm btn--secondary">Choose another<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} /></label>
            <button type="button" className="btn btn--sm btn--primary" onClick={done} disabled={!nat || busy}>{busy ? 'Uploading…' : cta}</button>
          </div>
          <p className={styles.fine}>Drag to place it. Saved as a 512 px square; camera and location data are not kept.</p>
        </>
      ) : (
        <label
          className={styles.drop}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]) }}
        >
          <ImageUp aria-hidden="true" />
          <b>Choose an image</b>
          <span>PNG, JPEG or WebP from this device. You frame it next.</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      )}
      {error ? <p className={styles.err} role="alert">{error}</p> : null}
    </div>
  )
}
