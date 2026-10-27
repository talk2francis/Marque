'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CHAPTERS, FILM, chapterAt, clock, filmArchived, filmVariant, mediaUrl, posterSources, type FilmChapter } from '../../../lib/film'
import { FILM_MEDIA, type FilmCodec, type FilmVariantKey } from '../../../lib/film-media'
import { track } from '../../../lib/track'
import styles from './film.module.css'

/**
 * The launch film, as part of the product rather than an embed (DESIGN-SYSTEM.md, "The film").
 *
 * - Costs nothing until wanted: a poster (AVIF/WebP/JPEG), preload none, the video's bytes
 *   only on intent. LCP, CLS and the hero are untouched.
 * - Sound by choice: the film only ever starts from a click or a key, so it starts with sound.
 * - Lights down: while it plays, the page around the screen dims (the Chamber's own
 *   "dark for doing"), and comes back up on pause, on Escape, at the end, or when it scrolls away.
 * - Always true: the cut is chosen at the moment of play, by the Campaign Dock's clock.
 * - Evidence on the frame: each chapter carries its provenance and a link to the real thing.
 * - The rail under the screen continues the film's own rail: chapter marks, a light that runs
 *   with the film, scrubbing, and a storyboard on hover.
 * - The end card's button is a real button.
 */

type Phase = 'poster' | 'loading' | 'playing' | 'paused' | 'ended'
type Source = 'poster' | 'hero' | 'chapter' | 'rail' | 'key' | 'replay' | 'transcript'

const AV1_PROBE = (codecs: string) => ({
  type: 'file' as const,
  video: { contentType: `video/mp4; codecs="${codecs}"`, width: 1920, height: 1080, bitrate: 2_000_000, framerate: 60 },
})

/** AV1 only where it decodes smoothly and in hardware; everything else gets H.264. */
async function pickCodec(): Promise<FilmCodec> {
  try {
    const v = document.createElement('video')
    if (!v.canPlayType(`video/mp4; codecs="${FILM_MEDIA.codecs.av1}"`)) return 'h264'
    if (!('mediaCapabilities' in navigator)) return 'h264'
    const r = await navigator.mediaCapabilities.decodingInfo(AV1_PROBE(FILM_MEDIA.codecs.av1))
    return r.supported && r.smooth && r.powerEfficient ? 'av1' : 'h264'
  } catch {
    return 'h264'
  }
}

export function FilmPlayer() {
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const codecRef = useRef<FilmCodec>('h264')
  const variantRef = useRef<FilmVariantKey>('d9')
  const pendingSeek = useRef<number | null>(null)
  const seenSincePlay = useRef(false)
  const quarters = useRef(new Set<number>())
  const hideTimer = useRef<number | null>(null)
  const scrubbing = useRef<{ wasPlaying: boolean } | null>(null)

  const [phase, setPhase] = useState<Phase>('poster')
  const [t, setT] = useState(0)
  const [muted, setMuted] = useState(false)
  const [full, setFull] = useState(false)
  const [theater, setTheater] = useState(false)
  const [idle, setIdle] = useState(false)
  const [archived, setArchived] = useState(false)
  const [startAt, setStartAt] = useState(0)
  const [pip, setPip] = useState(false)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [inView, setInView] = useState(false)
  const [failed, setFailed] = useState(false)
  const tapRef = useRef<{ type: string; wasIdle: boolean }>({ type: 'mouse', wasIdle: false })
  const playBtnRef = useRef<HTMLButtonElement>(null)

  const chapter = chapterAt(t)
  const live = phase === 'playing' || phase === 'paused' || phase === 'ended' || phase === 'loading'
  const poster = useMemo(() => posterSources(), [])

  // ---- mount: codec, deep link (?t=30), archive state, readiness for the hero cue
  useEffect(() => {
    setMounted(true)
    setArchived(filmArchived(Date.now()))
    setPip(typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled)
    const q = Number(new URL(window.location.href).searchParams.get('t'))
    if (Number.isFinite(q) && q > 0 && q < FILM.duration) { setStartAt(Math.floor(q)); setT(Math.floor(q)) }
    const pick = () => { void pickCodec().then((c) => { codecRef.current = c }) }
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(pick)
    else setTimeout(pick, 400)
    rootRef.current?.setAttribute('data-film-ready', '')
  }, [])

  // ---- the frame loop: progress as a CSS variable every frame, the clock text four times a second
  useEffect(() => {
    if (phase !== 'playing') return
    const v = videoRef.current
    if (!v) return
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      const p = v.currentTime / FILM.duration
      rootRef.current?.style.setProperty('--p', String(Math.min(1, p)))
      if (now - last > 240) { last = now; setT(v.currentTime) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  // ---- lights down: the page dims around the screen; the Dock steps aside; Escape works from anywhere
  useEffect(() => {
    if (!theater) return
    document.body.setAttribute('data-theater', '')
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) videoRef.current?.pause() }
    window.addEventListener('keydown', onEsc)
    return () => { document.body.removeAttribute('data-theater'); window.removeEventListener('keydown', onEsc) }
  }, [theater])

  // ---- scrolled away: lights up below half visible; pause once it is all but gone
  useEffect(() => {
    const el = frameRef.current
    if (!el || !live) return
    const io = new IntersectionObserver(([e]) => {
      if (!e) return
      const r = e.intersectionRatio
      setInView(r >= 0.35)
      if (r >= 0.6) seenSincePlay.current = true
      if (!seenSincePlay.current) return
      if (r < 0.5) setTheater(false)
      else if (phase === 'playing') setTheater(true)
      if (r < 0.1 && phase === 'playing') videoRef.current?.pause()
    }, { threshold: [0, 0.1, 0.5, 0.6, 1] })
    io.observe(el)
    return () => io.disconnect()
  }, [live, phase])

  // ---- the Campaign Dock steps aside while the film is in use and on screen (it would cover the controls)
  useEffect(() => {
    if (!live || !inView) return
    document.body.setAttribute('data-film-active', '')
    return () => document.body.removeAttribute('data-film-active')
  }, [live, inView])

  // ---- fullscreen state
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === frameRef.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  // ---- controls rest while it plays and nothing moves
  const wake = useCallback(() => {
    setIdle(false)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setIdle(true), 2200)
  }, [])
  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current) }, [])

  // ---- play: must run inside the click, so the browser lets it start with sound
  const play = useCallback((from: number | null, source: Source) => {
    const v = videoRef.current
    if (!v) return
    const key = filmVariant(Date.now())
    const codec = codecRef.current
    const src = mediaUrl(FILM_MEDIA.variants[key][codec].file)
    if (v.dataset.src !== src) {
      const at = v.dataset.src && from === null ? v.currentTime : null
      v.src = src
      v.dataset.src = src
      variantRef.current = key
      quarters.current.clear()
      pendingSeek.current = from ?? at ?? 0
    } else if (from !== null) {
      if (v.readyState >= 1) v.currentTime = from
      else pendingSeek.current = from
    }
    if (phase === 'ended' && from === null) { if (v.readyState >= 1) v.currentTime = 0; else pendingSeek.current = 0 }
    v.muted = muted
    setFailed(false)
    seenSincePlay.current = false
    // Lock screens and media keys name the film.
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      const art = FILM_MEDIA.poster.jpg[0]
      navigator.mediaSession.metadata = new MediaMetadata({ title: FILM.title, artist: 'Marque', album: 'The launch film', artwork: art ? [{ src: mediaUrl(art.file), sizes: `${art.w}x${Math.round((art.w * 9) / 16)}`, type: 'image/jpeg' }] : [] })
    }
    const p = v.play()
    setPhase((ph) => (ph === 'poster' || ph === 'ended' ? 'loading' : ph))
    setTheater(true)
    wake()
    // Keys work at once: focus moves from the poster button (which goes away) to the play control.
    requestAnimationFrame(() => { if (rootRef.current?.contains(document.activeElement) || document.activeElement === document.body) playBtnRef.current?.focus({ preventScroll: true }) })
    if (p) p.catch(() => {
      // Sound refused (the gesture was lost): play muted rather than not at all, and say so.
      v.muted = true; setMuted(true); void v.play().catch(() => setPhase('paused'))
    })
    track('film_play', { from: source, cut: key, codec }, { once: source === 'poster' })
  }, [muted, phase, wake])

  const pause = useCallback(() => { videoRef.current?.pause() }, [])
  const toggle = useCallback((source: Source) => {
    const v = videoRef.current
    if (!v) return
    if (phase === 'poster' || v.paused || v.ended) play(phase === 'poster' ? startAt || null : null, source)
    else pause()
  }, [phase, play, pause, startAt])

  const seek = useCallback((to: number) => {
    const v = videoRef.current
    if (!v) return
    const s = Math.max(0, Math.min(FILM.duration - 0.05, to))
    if (v.readyState >= 1) v.currentTime = s
    else pendingSeek.current = s
    setT(s)
    rootRef.current?.style.setProperty('--p', String(s / FILM.duration))
  }, [])

  const goChapter = useCallback((c: FilmChapter, source: Source) => {
    track('film_chapter', { c: c.id })
    if (phase === 'poster' || phase === 'ended' || videoRef.current?.paused) play(c.start, source)
    else seek(c.start)
  }, [phase, play, seek])

  // ---- the hero's "Watch the film", and transcript times, reach the player through one event
  useEffect(() => {
    const onCue = (e: Event) => {
      const d = (e as CustomEvent<{ from?: number; source?: Source }>).detail ?? {}
      play(typeof d.from === 'number' ? d.from : (phase === 'poster' ? startAt || null : null), d.source ?? 'hero')
    }
    window.addEventListener('marque:film', onCue)
    return () => window.removeEventListener('marque:film', onCue)
  }, [play, phase, startAt])

  // ---- video events
  const onLoadedMeta = () => {
    const v = videoRef.current
    if (v && pendingSeek.current !== null) { v.currentTime = pendingSeek.current; pendingSeek.current = null }
  }
  const onPlaying = () => { setPhase('playing'); setTheater(true); wake(); prefetchSprite() }
  // The storyboard sprite (one frame a second) loads once the film is in use, so the first hover already has it.
  const spriteLoaded = useRef(false)
  const prefetchSprite = () => {
    if (spriteLoaded.current) return
    spriteLoaded.current = true
    const img = new Image()
    img.decoding = 'async'
    img.src = mediaUrl(FILM_MEDIA.variants[filmVariant(Date.now())].storyboard.file)
  }
  const onPause = () => {
    const v = videoRef.current
    if (!v || v.ended || scrubbing.current) return
    setPhase('paused'); setTheater(false); setIdle(false); setT(v.currentTime)
  }
  const onEnded = () => {
    if (!quarters.current.has(100)) { quarters.current.add(100); track('film_quarter', { q: 100, cut: variantRef.current }) }
    setPhase('ended'); setTheater(false); setIdle(false); setT(FILM.duration)
    rootRef.current?.style.setProperty('--p', '1')
  }
  // Any seek, ours or the platform's (full screen on iPhone, picture in picture, media keys), moves the rail and the chip.
  const sync = () => {
    const v = videoRef.current
    if (!v) return
    setT(v.currentTime)
    rootRef.current?.style.setProperty('--p', String(Math.min(1, v.currentTime / FILM.duration)))
  }
  const onTime = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) sync()
    const q = Math.floor((v.currentTime / FILM.duration) * 4) * 25
    if (q > 0 && !quarters.current.has(q)) { quarters.current.add(q); track('film_quarter', { q, cut: variantRef.current }) }
  }
  const onError = () => {
    // A decoder that promised AV1 and then failed: fall back to H.264 where it stopped.
    const v = videoRef.current
    if (!v || codecRef.current === 'h264') {
      // Nothing more to fall back to: back to the poster, and say so on the button.
      setFailed(true); setPhase('poster'); setTheater(false)
      if (v) { v.removeAttribute('src'); delete v.dataset.src; v.load() }
      return
    }
    const at = v.currentTime
    codecRef.current = 'h264'
    const src = mediaUrl(FILM_MEDIA.variants[variantRef.current].h264.file)
    v.src = src; v.dataset.src = src; pendingSeek.current = at
    void v.play().catch(() => setPhase('paused'))
  }

  // ---- keys: the usual player keys, only when the player has focus
  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    const onControl = tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY'
    const v = videoRef.current
    if (!v) return
    const k = e.key
    if ((k === ' ' || k === 'Enter') && onControl) return
    if (k === ' ' || k === 'k' || k === 'K') { e.preventDefault(); toggle('key') }
    else if (k === 'ArrowLeft' || k === 'j' || k === 'J') { e.preventDefault(); seek(v.currentTime - 5) }
    else if (k === 'ArrowRight' || k === 'l' || k === 'L') { e.preventDefault(); seek(v.currentTime + 5) }
    else if (k === 'Home') { e.preventDefault(); seek(0) }
    else if (k === 'End') { e.preventDefault(); seek(FILM.duration - 0.1) }
    else if (k === 'm' || k === 'M') { e.preventDefault(); toggleMute() }
    else if (k === 'f' || k === 'F') { e.preventDefault(); void toggleFull() }
    else if (/^[0-9]$/.test(k) && phase !== 'poster') { e.preventDefault(); seek((Number(k) / 10) * FILM.duration) }
    wake()
  }

  const toggleMute = () => {
    const v = videoRef.current
    const m = !muted
    setMuted(m)
    if (v) v.muted = m
  }
  const toggleFull = async () => {
    const f = frameRef.current
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (!f || !v) return
    if (document.fullscreenElement) { await document.exitFullscreen().catch(() => undefined); return }
    if (f.requestFullscreen) await f.requestFullscreen().catch(() => v.webkitEnterFullscreen?.())
    else v.webkitEnterFullscreen?.()
  }
  const togglePip = async () => {
    const v = videoRef.current
    if (!v) return
    if (document.pictureInPictureElement) await document.exitPictureInPicture().catch(() => undefined)
    else await v.requestPictureInPicture().catch(() => undefined)
  }

  // ---- the rail: scrub by pointer, step by keys
  const onRailDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const to = railTimeIn(e, e.currentTarget)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (phase === 'poster' || phase === 'ended') { play(to, 'rail'); return }
    const v = videoRef.current
    scrubbing.current = { wasPlaying: !!v && !v.paused }
    v?.pause()
    seek(to)
  }
  const onRailMove = (e: React.PointerEvent) => {
    const to = railTimeIn(e, e.currentTarget)
    const r = railRef.current?.getBoundingClientRect()
    if (r && e.pointerType === 'mouse') setHover({ x: e.clientX - r.left, t: to })
    if (scrubbing.current) seek(to)
  }
  const onRailUp = () => {
    const s = scrubbing.current
    scrubbing.current = null
    if (s?.wasPlaying) void videoRef.current?.play()
  }
  const onRailKey = (e: React.KeyboardEvent) => {
    const v = videoRef.current
    const now = v?.currentTime ?? t
    const step = e.shiftKey ? 10 : 5
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0
    if (!dir) return
    e.preventDefault(); e.stopPropagation()
    const to = Math.max(0, now + dir * step)
    if (phase === 'poster') play(to, 'rail')
    else seek(to)
  }

  const hoverChapter = hover ? chapterAt(hover.t) : null
  const sb = FILM_MEDIA.storyboard
  const sprite = mounted ? mediaUrl(FILM_MEDIA.variants[filmVariant(Date.now())].storyboard.file) : null
  const thumbIdx = hover ? Math.min(Math.floor(hover.t / sb.every), Math.floor(FILM.duration / sb.every) - 1) : 0
  const ctaLive = !archived && (phase === 'playing' || phase === 'paused' || phase === 'ended') && t >= FILM.cta.from
  const ev = chapter.evidence
  const label = failed ? 'The film did not load. Try again' : phase === 'ended' ? 'Watch again' : startAt ? `Play from ${clock(startAt)}` : 'Play the film'

  return (
    <div
      ref={rootRef}
      className={styles.player}
      data-phase={phase}
      data-theater={theater || undefined}
      data-idle={(idle && phase === 'playing') || undefined}
      data-full={full || undefined}
      onKeyDown={onKey}
      style={{ ['--p' as string]: String(t / FILM.duration) }}
    >
      <div className={styles.frameWrap}>
        <span className={`${styles.reg} ${styles.regTl}`} aria-hidden="true" />
        <span className={`${styles.reg} ${styles.regTr}`} aria-hidden="true" />
        <span className={`${styles.reg} ${styles.regBl}`} aria-hidden="true" />
        <span className={`${styles.reg} ${styles.regBr}`} aria-hidden="true" />
        <div ref={frameRef} className={styles.frame} onPointerMove={live ? wake : undefined}
          onPointerDown={live ? (e) => { tapRef.current = { type: e.pointerType, wasIdle: idle }; wake() } : undefined}>
          <video
            ref={videoRef}
            className={styles.video}
            preload="none"
            playsInline
            aria-label={`${FILM.name}, a 1 minute film`}
            onLoadedMetadata={onLoadedMeta}
            onPlaying={onPlaying}
            onPause={onPause}
            onEnded={onEnded}
            onTimeUpdate={onTime}
            onSeeked={sync}
            onError={onError}
            onWaiting={() => rootRef.current?.setAttribute('data-buffering', '')}
            onCanPlay={() => rootRef.current?.removeAttribute('data-buffering')}
            onClick={() => {
              // On a touch screen, the first tap on a playing film shows the controls; the next one pauses.
              if (tapRef.current.type !== 'mouse' && tapRef.current.wasIdle) return
              toggle('key')
            }}
          >
            <track kind="chapters" src="/film/chapters.vtt" srcLang="en" label="Chapters" />
          </video>

          {/* The poster: a still from 0:07, date-free, so it is true on any day. */}
          <picture className={styles.poster} aria-hidden="true">
            <source type="image/avif" srcSet={poster.avif} sizes="(max-width: 720px) 100vw, min(1184px, 92vw)" />
            <source type="image/webp" srcSet={poster.webp} sizes="(max-width: 720px) 100vw, min(1184px, 92vw)" />
            <img src={poster.fallback} srcSet={poster.jpg} sizes="(max-width: 720px) 100vw, min(1184px, 92vw)" alt="" loading="lazy" decoding="async" fetchPriority="low" width={1920} height={1080} />
          </picture>

          {phase === 'poster' || phase === 'ended' ? (
            <button
              type="button"
              className={styles.start}
              onClick={() => play(phase === 'ended' ? 0 : startAt || null, phase === 'ended' ? 'replay' : 'poster')}
              onPointerEnter={() => { const v = videoRef.current; if (v && v.preload === 'none') v.preload = 'metadata' }}
              aria-label={phase === 'ended' ? 'Watch the film again' : `${label}: ${FILM.title}, 1 minute, with sound`}
            >
              <span className={styles.pill}>
                <span className={styles.pillDisc} aria-hidden="true">{phase === 'ended' ? <IconReplay /> : <IconPlay />}</span>
                <span className={styles.pillText}>{label}</span>
                <span className={styles.pillTime}>{phase === 'ended' ? clock(FILM.duration) : clock(FILM.duration - startAt)}</span>
              </span>
            </button>
          ) : null}

          {live ? (
            <a className={styles.evidence} key={chapter.id} href={ev.href ?? undefined} target={ev.href ? '_blank' : undefined} rel="noopener" data-prov={ev.provenance ?? 'none'}
              onClick={() => track('film_evidence', { c: chapter.id })} aria-label={`${ev.label}${ev.href ? ', opens in a new tab' : ''}`}>
              {ev.provenance ? <span className={`prov prov--${ev.provenance === 'ILLUSTRATIVE' ? 'claimed' : ev.provenance.toLowerCase()}`}>{ev.provenance}</span> : null}
              <span className={styles.evText}>{archived && chapter.id === 'quest' ? 'Set and Earn closed Thu 5 Nov, 12:00 UTC' : ev.label}</span>
              {ev.href ? <IconOut /> : null}
            </a>
          ) : null}

          {ctaLive ? (
            <a className={styles.cta} href="/quest" onClick={() => track('film_cta', { to: 'quest', at: Math.round(t) })}
              style={{ left: `${FILM.cta.left}%`, top: `${FILM.cta.top}%`, width: `${FILM.cta.width}%`, height: `${FILM.cta.height}%` }}>
              <span className="sr-only">Start the Set and Earn quest</span>
            </a>
          ) : null}

          {live && phase !== 'ended' ? (
            <div className={styles.controls}>
              <div
                className={styles.scrub}
                onPointerDown={onRailDown} onPointerMove={(e) => { if (scrubbing.current) seek(railTimeIn(e, e.currentTarget)) }} onPointerUp={onRailUp} onPointerCancel={onRailUp}
                role="slider" tabIndex={-1} aria-label="Seek" aria-valuemin={0} aria-valuemax={FILM.duration} aria-valuenow={Math.round(t)} aria-valuetext={`${clock(t)}, ${chapter.title}`}
              >
                <span className={styles.scrubLine} />
                <span className={styles.scrubFill} />
                {CHAPTERS.slice(1).map((c) => <i key={c.id} className={styles.scrubTick} style={{ left: `${(c.start / FILM.duration) * 100}%` }} />)}
              </div>
              <div className={styles.row}>
                <button ref={playBtnRef} type="button" className={styles.ctl} onClick={() => toggle('key')} aria-label={phase === 'playing' ? 'Pause' : 'Play'}>
                  {phase === 'playing' || phase === 'loading' ? <IconPause /> : <IconPlay />}
                </button>
                <span className={styles.time}><span>{clock(t)}</span> / {clock(FILM.duration)}</span>
                <span className={styles.chapterNow} aria-hidden="true">{chapter.title}</span>
                <span className={styles.grow} />
                <button type="button" className={styles.ctl} onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Mute'} aria-pressed={muted}>
                  {muted ? <IconMuted /> : <IconSound />}
                </button>
                {pip ? <button type="button" className={`${styles.ctl} ${styles.pipBtn}`} onClick={() => void togglePip()} aria-label="Picture in picture"><IconPip /></button> : null}
                <button type="button" className={styles.ctl} onClick={() => void toggleFull()} aria-label={full ? 'Exit full screen' : 'Full screen'}>
                  {full ? <IconShrink /> : <IconExpand />}
                </button>
              </div>
            </div>
          ) : null}
          <span className={styles.spinner} aria-hidden="true" />
        </div>
      </div>

      {/* The rail: the film's own device, continued under the screen. */}
      <div className={styles.railWrap}>
        <div
          ref={railRef}
          className={styles.rail}
          role="slider"
          tabIndex={0}
          aria-label="Film position"
          aria-valuemin={0}
          aria-valuemax={FILM.duration}
          aria-valuenow={Math.round(t)}
          aria-valuetext={`${clock(t)} of 1:00, ${chapter.title}`}
          onPointerDown={onRailDown}
          onPointerMove={onRailMove}
          onPointerUp={onRailUp}
          onPointerCancel={onRailUp}
          onPointerEnter={prefetchSprite}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onRailKey}
        >
          <span className={styles.railLine} />
          <span className={styles.railFill} />
          <span className={styles.railLight} />
          {CHAPTERS.map((c) => (
            <i key={c.id} className={styles.railMark} data-done={t >= c.start && live ? '' : undefined} style={{ left: `${(c.start / FILM.duration) * 100}%` }} />
          ))}
          <i className={`${styles.railMark} ${styles.railEnd}`} data-done={phase === 'ended' ? '' : undefined} style={{ left: '100%' }} />
          <span className={styles.railEndLabel} aria-hidden="true">1:00</span>
          {hover && hoverChapter ? (
            <span className={styles.peek} style={{ left: `clamp(${sb.w / 2}px, ${hover.x}px, calc(100% - ${sb.w / 2}px))` }} aria-hidden="true">
              {sprite ? <span className={styles.peekImg} style={{ backgroundImage: `url(${sprite})`, backgroundPosition: `-${(thumbIdx % sb.cols) * sb.w}px -${Math.floor(thumbIdx / sb.cols) * sb.h}px`, backgroundSize: `${sb.cols * sb.w}px auto`, width: sb.w, height: sb.h }} /> : null}
              <span className={styles.peekText}><b>{clock(hover.t)}</b> {hoverChapter.title}</span>
            </span>
          ) : null}
        </div>
        <ol className={styles.chapters} aria-label="Chapters">
          {CHAPTERS.map((c, i) => (
            <li key={c.id} data-row={i % 2 ? 'b' : 'a'} data-now={live && chapter.id === c.id ? '' : undefined} style={{ left: `${(c.start / FILM.duration) * 100}%` }}>
              <button type="button" onClick={() => goChapter(c, 'chapter')} aria-label={`${c.title}, at ${clock(c.start)}`}>
                {c.title}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {mounted ? createPortal(<div className={styles.scrim} data-on={theater || undefined} onClick={pause} aria-hidden="true" />, document.body) : null}
    </div>
  )
}

function railTimeIn(e: React.PointerEvent, el: Element) {
  const r = el.getBoundingClientRect()
  return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * FILM.duration
}

/* ---- icons: drawn for the player, one stroke weight ---- */
const S = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
function IconPlay() { return <svg {...S}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" /></svg> }
function IconPause() { return <svg {...S}><path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth={2.6} /></svg> }
function IconReplay() { return <svg {...S}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5v3.7h3.7" /></svg> }
function IconSound() { return <svg {...S}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" /></svg> }
function IconMuted() { return <svg {...S}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></svg> }
function IconExpand() { return <svg {...S}><path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" /></svg> }
function IconShrink() { return <svg {...S}><path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5" /></svg> }
function IconPip() { return <svg {...S}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><rect x="12" y="11.5" width="6" height="4.5" rx="1" fill="currentColor" stroke="none" /></svg> }
function IconOut() { return <svg {...S} width={12} height={12}><path d="M8 16L16 8M9.5 8H16v6.5" /></svg> }
