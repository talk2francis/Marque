'use client'
import { useEffect, useRef, useState } from 'react'
import { ImageUp } from 'lucide-react'
import { BANNER_SIZE, bannerCrop } from '../../../lib/agent-banner-model'
import styles from './banner.module.css'

/** A local wide crop. Selecting, moving and zooming never uploads the source file. */
export function BannerCropper({ busy = false, onSave }: { busy?: boolean; onSave: (dataUrl: string) => void }) {
  const frame = useRef<HTMLDivElement>(null), image = useRef<HTMLImageElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [width, setWidth] = useState(240), [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])
  useEffect(() => {
    if (!source || !frame.current) return
    const measure = () => { if (frame.current) { setWidth(frame.current.clientWidth); setPosition(null) } }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [source])
  const crop = natural ? bannerCrop(natural, width, zoom, position) : null
  const pick = (file?: File) => {
    if (busy || !file) return
    setError(null)
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError('Choose a PNG, JPEG or WebP image.'); return }
    if (file.size > 12_000_000) { setError('Choose an image under 12 MB.'); return }
    if (source) URL.revokeObjectURL(source)
    setNatural(null); setPosition(null); setZoom(1); setSource(URL.createObjectURL(file))
  }
  const save = () => {
    if (!crop || !image.current || busy) return
    const canvas = document.createElement('canvas')
    canvas.width = BANNER_SIZE.width; canvas.height = BANNER_SIZE.height
    const context = canvas.getContext('2d')
    if (!context) { setError('This browser could not prepare the image. Try another browser.'); return }
    context.imageSmoothingQuality = 'high'
    context.drawImage(image.current, -crop.x / crop.scale, -crop.y / crop.scale, crop.width / crop.scale, crop.height / crop.scale, 0, 0, canvas.width, canvas.height)
    const result = canvas.toDataURL('image/webp', 0.9)
    if (result.length > 2_000_000) { setError('The prepared image is too large. Choose a less detailed image.'); return }
    onSave(result)
  }
  return <div className={styles.cropper}>
    {source ? <>
      <div ref={frame} className={styles.frame} onPointerDown={e => { if (busy || !crop) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: crop.x, py: crop.y } }} onPointerMove={e => { if (drag.current && !busy) setPosition({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }) }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <img ref={image} src={source} alt="Your banner crop preview" draggable={false} onLoad={e => { setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }); setPosition(null) }} onError={() => { setError('That image could not be opened. Choose another one.'); setSource(null); setNatural(null) }} style={crop ? { width: crop.drawnWidth, height: crop.drawnHeight, transform: `translate(${crop.x}px, ${crop.y}px)` } : { visibility: 'hidden' }} />
      </div>
      <label className={styles.slider}>Zoom<input type="range" min="1" max="3" step="0.01" value={zoom} disabled={busy} onChange={e => { setZoom(Number(e.target.value)); setPosition(null) }} /></label>
      <div className={styles.pan} aria-label="Banner position">
        <label>Horizontal position<input type="range" min="0" max="100" value={crop && crop.drawnWidth > crop.width ? Math.round(crop.x / (crop.width - crop.drawnWidth) * 100) : 50} disabled={busy || !crop || crop.drawnWidth <= crop.width} onChange={e => { if (crop) setPosition({ x: (crop.width - crop.drawnWidth) * Number(e.target.value) / 100, y: crop.y }) }} /></label>
        <label>Vertical position<input type="range" min="0" max="100" value={crop && crop.drawnHeight > crop.height ? Math.round(crop.y / (crop.height - crop.drawnHeight) * 100) : 50} disabled={busy || !crop || crop.drawnHeight <= crop.height} onChange={e => { if (crop) setPosition({ x: crop.x, y: (crop.height - crop.drawnHeight) * Number(e.target.value) / 100 }) }} /></label>
      </div>
      <p>Keep important details near the centre. The sides crop closer on phones.</p>
      <div className={styles.actions}><label className="btn">Choose another<input type="file" accept="image/png,image/jpeg,image/webp" className={styles.fileInput} disabled={busy} onChange={e => pick(e.target.files?.[0])} /></label><button type="button" className="btn btn--primary" disabled={busy || !natural} onClick={save}>{busy ? 'Saving banner...' : 'Save banner'}</button></div>
    </> : <label className={styles.pick}><ImageUp aria-hidden="true" /><b>Choose a banner</b><span>PNG, JPEG or WebP. You can frame it before saving.</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => pick(e.target.files?.[0])} /></label>}
    <p>Prepared as a wide image. Camera and location data are removed before upload.</p>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </div>
}
