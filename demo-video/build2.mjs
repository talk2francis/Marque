/**
 * Film v2 assembly.
 *
 * v1's problems, fixed here:
 *  - data lived on filmed web pages that were slow-zoomed → monotonous.
 *    Now the DATA is on motion-graphic cards (demo-video/cards/) and the
 *    PRODUCT appears in only 4 HELD shots (demo-video/shots2/), no zoom, a
 *    barely-there 1.0→1.03 drift so the frame is not dead.
 *  - captured on a thrashing VPS → sluggish. Recaptured on a quiet box.
 *  - <break> tags glitched the voice → gone; real silence in the mix.
 *  - VO out of sync → picture is cut to the VO here, scene by scene.
 *
 *   node demo-video/build2.mjs            -> demo-video/render/marque-demo-v2.mp4
 *   VOICE=vo2-bill node demo-video/build2.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'demo-video')
const VO = join(ROOT, process.env.VOICE || 'vo2')
const CARDS = join(ROOT, 'cards')
const SHOTS = join(ROOT, 'shots2')
const OUT = join(ROOT, 'render')
const WORK = join(OUT, 'work2')
mkdirSync(WORK, { recursive: true })

const W = 1920, H = 1080, FPS = 30
const MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'

const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())
const toWav = (src, out) => { execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', 'aresample=48000', '-ac', '2', '-c:a', 'pcm_s16le', out]); return out }
const silence = (s, out) => { execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', s.toFixed(3), '-c:a', 'pcm_s16le', out]); return out }

/**
 * The film. `vo` is a list of items: a string = a VO mp3 basename; a number =
 * that many seconds of silence. `src` is 'card:<name>' or 'shot:<name>'; `tail`
 * (optional) appends N seconds of another source after the VO ends.
 */
const SCENES = [
  { id: 'open',     src: 'card:open',     vo: ['01a', 0.5, '01b'], pad: 1.4 },
  { id: 'funnel',   src: 'card:funnel',   vo: ['02a', 0.35, '02b', 0.4, '02c'], pad: 0.8 },
  { id: 'zero',     src: 'card:zero',     vo: ['03a', 1.5, '03b', 0.7, '03c'], pad: 1.0 },
  { id: 'title',    src: 'card:title',    vo: ['04'], pad: 0.8 },
  { id: 'read',     src: 'shot:s_positions', label: 'LIVE · READ FROM CHAIN', vo: ['05a', 0.4, '05b'], pad: 0.6 },
  { id: 'standard', src: 'card:standard', vo: ['06a', 0.4, '06b'], pad: 0.9 },
  { id: 'charter',  src: 'shot:s_charter', label: 'LIVE · BSC TESTNET 97', vo: ['07a', 0.4, '07b'], pad: 0.7 },
  { id: 'receipt',  src: 'shot:s_runroom', label: 'LIVE · BSC TESTNET 97', vo: ['08'], pad: 0.6 },
  { id: 'proof',    src: 'card:proof',    tailSrc: 'shot:s_proofpage', tail: 2.6, tailLabel: 'ARCHIVED · BSC MAINNET 56',
    vo: ['09a', 0.4, '09b'], pad: 0.6 },
  { id: 'close',    src: 'card:close',    vo: ['10a', 0.6, '10b'], pad: 1.6 },
]

// ---- 1. audio: VO track scene by scene ----
const parts = []
let t = 0
const times = []
for (const s of SCENES) {
  const start = t
  for (const item of s.vo) {
    if (typeof item === 'number') { const g = join(WORK, `g${parts.length}.wav`); silence(item, g); parts.push(g); t += item; continue }
    const f = join(VO, `${item}.mp3`)
    if (!existsSync(f)) throw new Error(`missing VO ${item}`)
    const w = join(WORK, `v-${s.id}-${item}.wav`); toWav(f, w); parts.push(w); t += dur(w)
  }
  const pad = join(WORK, `pad-${s.id}.wav`); silence(s.pad, pad); parts.push(pad); t += s.pad
  const total = t - start
  times.push({ id: s.id, start, total, tail: s.tail || 0 })
}
const totalDur = t
console.log('scene timeline:')
for (const x of times) console.log(`  ${x.id.padEnd(9)} ${x.start.toFixed(1).padStart(6)}  +${x.total.toFixed(1)}s${x.tail ? `  (+${x.tail}s tail)` : ''}`)
console.log(`  TOTAL ${totalDur.toFixed(1)}s  (${Math.floor(totalDur / 60)}:${String(Math.round(totalDur % 60)).padStart(2, '0')})`)

const voList = join(WORK, 'vo.txt')
writeFileSync(voList, parts.map((p) => `file '${p}'`).join('\n'))
const voTrack = join(WORK, 'vo.wav')
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', voList, '-af', 'aresample=48000', '-ac', '2', voTrack])

// ---- 2. music: sub drone; mute across the zero beat; swell under proof ----
const zero = times.find((x) => x.id === 'zero')
const proof = times.find((x) => x.id === 'proof')
const zeroMuteFrom = zero.start + 2.0   // after "684 conformance runs"
const zeroMuteTo = zero.start + 5.2
const music = join(WORK, 'music.wav')
execFileSync('ffmpeg', ['-y', '-v', 'error',
  '-f', 'lavfi', '-i', `sine=frequency=55:sample_rate=48000:duration=${totalDur}`,
  '-f', 'lavfi', '-i', `sine=frequency=82.4:sample_rate=48000:duration=${totalDur}`,
  '-f', 'lavfi', '-i', `sine=frequency=110:sample_rate=48000:duration=${totalDur}`,
  '-filter_complex',
    `[0:a]volume=0.09[a0];[1:a]volume=0.045[a1];` +
    `[2:a]volume='0.028*between(t,${proof.start},${proof.start + proof.total})':eval=frame[a2];` +
    `[a0][a1][a2]amix=inputs=3:normalize=0,` +
    `volume='1 + 1.5*between(t,${proof.start},${proof.start + proof.total})*sin(PI*(t-${proof.start})/${proof.total})':eval=frame,` +
    `volume='if(between(t,${zeroMuteFrom.toFixed(2)},${zeroMuteTo.toFixed(2)}),0,1)':eval=frame,` +
    `afade=t=in:st=0:d=2.5,afade=t=out:st=${(totalDur - 3.5).toFixed(2)}:d=3.5,` +
    `lowpass=f=190,aresample=48000`,
  '-ac', '2', '-t', totalDur.toFixed(3), music])

// ---- 3. mix ----
const mix = join(WORK, 'mix.wav')
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', voTrack, '-i', music,
  '-filter_complex',
    `[0:a]highpass=f=85,acompressor=threshold=-18dB:ratio=2.4:attack=12:release=240,loudnorm=I=-16:TP=-1.5:LRA=11[v];` +
    `[v]asplit=2[vm][vk];` +
    `[1:a][vk]sidechaincompress=threshold=0.035:ratio=6:attack=18:release=300[d];` +
    `[vm][d]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=9,aresample=48000`,
  '-ac', '2', '-c:a', 'pcm_s16le', mix])

// ---- 4. video: one clip per scene, cut to the scene's audio length ----
function cardClip(name, seconds, out) {
  const src = join(CARDS, `${name}.webm`)
  // cards are already 1920x1080; just trim/loop-last to length, gentle ease at cut
  execFileSync('ffmpeg', ['-y', '-v', 'error',
    '-stream_loop', dur(src) < seconds ? '-1' : '0', '-i', src, '-t', seconds.toFixed(3),
    '-vf', `fps=${FPS},format=yuv420p`, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out])
}
function shotClip(name, seconds, label, out) {
  const src = join(SHOTS, `${name}.webm`)
  // crop the leftover charter strip (top ~48px of the 2560x1440 capture), then
  // a 1.0->1.03 drift over the scene — alive, not a zoom.
  const frames = Math.max(1, Math.round(seconds * FPS))
  const z = `1.0+0.03*(on/${frames})`
  const vf =
    `crop=2560:1392:0:48,scale=3000:-2,` +
    `zoompan=z='${z}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},` +
    `format=yuv420p` +
    (label ? `,drawtext=fontfile=${MONO}:text='${label}':fontcolor=0xd9ae45:fontsize=17:x=52:y=h-56:box=1:boxcolor=0x000000@0.5:boxborderw=12` : '')
  execFileSync('ffmpeg', ['-y', '-v', 'error',
    '-stream_loop', dur(src) < seconds ? '-1' : '0', '-i', src, '-t', seconds.toFixed(3),
    '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out])
}

const clips = []
for (let i = 0; i < SCENES.length; i++) {
  const s = SCENES[i], x = times[i]
  const mainLen = x.total - (s.tail || 0)
  process.stdout.write(`  ${s.id} (${x.total.toFixed(1)}s)… `)
  const [kind, name] = s.src.split(':')
  const c = join(WORK, `c${String(i).padStart(2, '0')}-${s.id}.mp4`)
  if (kind === 'card') cardClip(name, mainLen, c)
  else shotClip(name, mainLen, s.label || '', c)
  clips.push(c)
  if (s.tail) {
    const [_tk, tn] = s.tailSrc.split(':')
    const tc = join(WORK, `c${String(i).padStart(2, '0')}-${s.id}-tail.mp4`)
    shotClip(tn, s.tail, s.tailLabel || '', tc)
    clips.push(tc)
  }
  console.log('ok')
}

const vlist = join(WORK, 'clips.txt')
writeFileSync(vlist, clips.map((p) => `file '${p}'`).join('\n'))
const silent = join(WORK, 'silent.mp4')
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', vlist,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', silent])

const final = join(OUT, 'marque-demo-v2.mp4')
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', mix,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', final])
console.log(`\n✓ ${final}`)
execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'default=nw=1', final], { stdio: 'inherit' })
