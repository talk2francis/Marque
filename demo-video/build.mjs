/**
 * Assemble the demo film from the captured shots + the ElevenLabs VO.
 *
 *   node demo-video/build.mjs            # full build -> demo-video/render/marque-demo.mp4
 *   node demo-video/build.mjs --audio    # just the mixed audio track (fast iteration)
 *
 * Narration is the master clock (Phase V2). Each scene is `vo lines + a tail
 * gap`; the picture for that scene is stretched/trimmed to the scene's audio
 * length, never the other way round. No speech time-stretch.
 *
 * Video: 1920x1080. Every shot is a crop of the 2560x1440 capture with a slow
 * push — a crop, never an upscale. Dark theme throughout; the Charter shot is
 * the cockpit, which is its own deeper dark (the "screen dims" beat needs no
 * light->dark swap now that the product is dark by default).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'demo-video')
const VO = join(ROOT, 'vo')
const CAP = join(ROOT, 'capture-1440')
const OUT = join(ROOT, 'render')
const WORK = join(OUT, 'work')
mkdirSync(WORK, { recursive: true })

const AUDIO_ONLY = process.argv.includes('--audio')

const dur = (f) =>
  parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())

/**
 * The film, scene by scene. `vo` are the mp3 basenames (played back to back);
 * `gap` is silence appended after them; `shot` is the capture clip; `push` is
 * [fromScale, toScale] for the slow zoom (1 = full frame). `title` renders a
 * generated card instead of a shot. `label` is the on-screen provenance chip.
 */
const SCENES = [
  { id: 'cold', title: 'cold', vo: ['01_open_a', '01_open_b'], gap: 1.2 },
  { id: 'count', shot: '01_funnel_collapse', push: [1.0, 1.12], gap: 0.3,
    vo: ['02_count_a'], label: 'LIVE CAPTURE' },
  { id: 'test', shot: '02_standard_fail', push: [1.06, 1.16], gap: 0.2,
    vo: ['02_count_c'], label: 'LIVE CAPTURE' },
  { id: 'zero', title: 'zero', vo: ['02_count_d', '02_count_e'], gap: 1.0 },
  { id: 'title', title: 'title', vo: ['03_title'], gap: 0.8 },
  { id: 'read', shot: '03_positions_read', push: [1.0, 1.08], gap: 0.5,
    vo: ['04_read_a'], label: 'LIVE CAPTURE' },
  { id: 'find', shot: '04_marketplace_sort', push: [1.0, 1.1], gap: 0.3,
    vo: ['05_find_a', '05_find_b'], label: 'LIVE CAPTURE' },
  { id: 'compare', shot: '06_compare', push: [1.04, 1.12], gap: 0.5,
    vo: ['05_find_c'], label: 'LIVE CAPTURE' },
  { id: 'standard', shot: '07_standard_pass_fail', push: [1.0, 1.1], gap: 0.3,
    vo: ['06_test_a', '06_test_b'], label: 'LIVE CAPTURE' },
  { id: 'bound', shot: '08_charter_grant', push: [1.0, 1.12], gap: 0.4,
    vo: ['07_bound_a', '07_bound_b', '07_bound_c'], label: 'LIVE CAPTURE · BSC TESTNET 97' },
  { id: 'receipt', shot: '09_run_room', push: [1.0, 1.1], gap: 0.3,
    vo: ['08_proof_a'], label: 'LIVE CAPTURE · BSC TESTNET 97' },
  { id: 'proof', shot: '11_pancake_proof', push: [1.06, 1.16], gap: 0.6,
    vo: ['08_proof_c'], label: 'ARCHIVED RESULT · BSC MAINNET 56' },
  { id: 'close', title: 'close', vo: ['09_close_a', '09_close_b'], gap: 1.5 },
]

// ---------------------------------------------------------------------------
// 1. Audio — one continuous narration track, scene by scene, with gaps.
// ---------------------------------------------------------------------------
const silence = (secs, out) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i',
    `anullsrc=r=48000:cl=stereo`, '-t', secs.toFixed(3), '-c:a', 'pcm_s16le', out])

/** Normalise any input to 48k/stereo/pcm so concat never mixes formats. */
const toWav = (src, out, extraAf = '') => {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src,
    '-af', `${extraAf ? extraAf + ',' : ''}aresample=48000`, '-ac', '2',
    '-c:a', 'pcm_s16le', out])
  return out
}

const parts = []
let t = 0
const sceneTimes = []
for (const s of SCENES) {
  const start = t
  for (const v of s.vo) {
    const f = join(VO, `${v}.mp3`)
    if (!existsSync(f)) throw new Error(`missing VO ${v}`)
    const w = join(WORK, `vo-${v}.wav`)
    toWav(f, w)
    parts.push(w)
    t += dur(w)
  }
  const gapFile = join(WORK, `gap-${s.id}.wav`)
  silence(s.gap, gapFile)
  parts.push(gapFile)
  t += s.gap
  sceneTimes.push({ id: s.id, start, end: t, dur: t - start })
}
const total = t
console.log('scene timeline:')
for (const st of sceneTimes) console.log(`  ${st.id.padEnd(10)} ${st.start.toFixed(1).padStart(6)} → ${st.end.toFixed(1).padStart(6)}  (${st.dur.toFixed(1)}s)`)
console.log(`  TOTAL ${total.toFixed(1)}s  (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')})`)

// concat VO
const voList = join(WORK, 'vo.txt')
writeFileSync(voList, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'))
const voTrack = join(WORK, 'vo-concat.wav')
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', voList,
  '-af', 'aresample=48000', '-ac', '2', voTrack])

// ---------------------------------------------------------------------------
// 2. Music bed — restrained, synthesised. Sub drone + sparse piano-ish marks;
//    a mute across the "zero" beat; one swell under the proof scene.
// ---------------------------------------------------------------------------
const zeroScene = sceneTimes.find((s) => s.id === 'zero')
const proofScene = sceneTimes.find((s) => s.id === 'proof')
// sub drone at ~55 Hz + a fifth at ~82 Hz, low; gentle tremolo
const _droneExpr =
  `sine=frequency=55:sample_rate=48000,` +
  `volume='0.5*(1+0.15*sin(2*PI*0.08*t))':eval=frame`
const musicRaw = join(WORK, 'music-raw.wav')
execFileSync('ffmpeg', ['-y', '-v', 'error',
  '-f', 'lavfi', '-i', `sine=frequency=55:sample_rate=48000:duration=${total}`,
  '-f', 'lavfi', '-i', `sine=frequency=82.4:sample_rate=48000:duration=${total}`,
  '-f', 'lavfi', '-i', `sine=frequency=110:sample_rate=48000:duration=${total}`,
  '-filter_complex',
    `[0:a]volume=0.10[a0];` +
    `[1:a]volume=0.05[a1];` +
    `[2:a]volume='0.03*between(t,${proofScene.start},${proofScene.end})':eval=frame[a2];` +
    `[a0][a1][a2]amix=inputs=3:normalize=0,` +
    // swell under proof
    `volume='1 + 1.6*between(t,${proofScene.start},${proofScene.end})*sin(PI*(t-${proofScene.start})/${proofScene.dur})':eval=frame,` +
    // mute across the zero beat (40ms fades either side)
    `volume='if(between(t,${(zeroScene.start + 0.05).toFixed(2)},${(zeroScene.start + 3.6).toFixed(2)}),0,1)':eval=frame,` +
    `afade=t=in:st=0:d=2,afade=t=out:st=${(total - 3).toFixed(2)}:d=3,` +
    `lowpass=f=180,aresample=48000`,
  '-ac', '2', '-t', total.toFixed(3), musicRaw])

// ---------------------------------------------------------------------------
// 3. Mix: narration on top, music sidechained under it.
// ---------------------------------------------------------------------------
const mix = join(WORK, 'mix.wav')
execFileSync('ffmpeg', ['-y', '-v', 'error',
  '-i', voTrack, '-i', musicRaw,
  '-filter_complex',
    `[0:a]highpass=f=80,acompressor=threshold=-18dB:ratio=2.5:attack=15:release=250,` +
    `loudnorm=I=-16:TP=-1.5:LRA=11[v];` +
    `[v]asplit=2[vmix][vkey];` +
    `[1:a][vkey]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=320[duck];` +
    `[vmix][duck]amix=inputs=2:normalize=0,` +
    `loudnorm=I=-14:TP=-1.0:LRA=9,aresample=48000`,
  '-ac', '2', '-c:a', 'pcm_s16le', mix])

execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', mix, '-c:a', 'aac', '-b:a', '256k',
  join(OUT, 'marque-demo-audio.m4a')])
console.log(`\naudio → ${join(OUT, 'marque-demo-audio.m4a')}  (${total.toFixed(1)}s)`)

if (AUDIO_ONLY) process.exit(0)

// ---------------------------------------------------------------------------
// 4. Video — one clip per scene, cut to the scene's audio length.
// ---------------------------------------------------------------------------
const W = 1920, H = 1080, FPS = 30

/** A generated title card (black, centred type) as a short clip. */
function titleCard(kind, seconds, out) {
  const fontfile = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
  const fontUi = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
  let draw = ''
  if (kind === 'cold') {
    draw =
      `drawtext=fontfile=${fontfile}:text='298\\,817':fontcolor=0xECE9E1:fontsize=132:` +
      `x=(w-tw)/2:y=(h-th)/2-30:alpha='min(1,(t-0.2)/0.8)',` +
      `drawtext=fontfile=${fontUi}:text='AI agents registered on BNB Smart Chain':fontcolor=0x9b9e8d:fontsize=30:` +
      `x=(w-tw)/2:y=(h/2)+70:alpha='min(1,(t-0.6)/0.8)'`
  } else if (kind === 'zero') {
    draw =
      `drawtext=fontfile=${fontfile}:text='Passes\\: 0':fontcolor=0xcd6f63:fontsize=150:` +
      `x=(w-tw)/2:y=(h-th)/2:alpha='min(1,t/0.5)'`
  } else if (kind === 'title') {
    draw =
      `drawtext=fontfile=${fontUi}:text='Marque':fontcolor=0xECE9E1:fontsize=120:` +
      `x=(w-tw)/2:y=(h-th)/2-20:alpha='min(1,t/0.6)',` +
      `drawtext=fontfile=${fontUi}:text='The agent marketplace for BNB Smart Chain':fontcolor=0x9b9e8d:fontsize=30:` +
      `x=(w-tw)/2:y=(h/2)+80:alpha='min(1,(t-0.4)/0.6)'`
  } else { // close / end card
    draw =
      `drawtext=fontfile=${fontUi}:text='Marque':fontcolor=0xECE9E1:fontsize=110:` +
      `x=(w-tw)/2:y=(h-th)/2-40:alpha='min(1,t/0.6)',` +
      `drawtext=fontfile=${fontfile}:text='marque.trade':fontcolor=0xd9ae45:fontsize=34:` +
      `x=(w-tw)/2:y=(h/2)+50:alpha='min(1,(t-0.3)/0.6)',` +
      `drawtext=fontfile=${fontUi}:text='Agents you can hold to account.':fontcolor=0x9b9e8d:fontsize=26:` +
      `x=(w-tw)/2:y=(h/2)+110:alpha='min(1,(t-0.6)/0.6)'`
  }
  execFileSync('ffmpeg', ['-y', '-v', 'error',
    '-f', 'lavfi', '-i', `color=c=0x15140f:s=${W}x${H}:r=${FPS}:d=${seconds.toFixed(3)}`,
    '-vf', `${draw},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out])
}

/** A shot clip: crop-push of the 2560x1440 capture, cut to `seconds`, + label. */
function shotClip(shot, seconds, push, label, out) {
  const src = join(CAP, `${shot}.webm`)
  const srcDur = dur(src)
  // loop the last frame if the capture is shorter than the scene needs
  const [z0, z1] = push
  const fontfile = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
  // zoompan works on a scaled-up canvas; we scale 2560->3200 then pan a 1920x1080 window.
  const zExpr = `${z0}+(${(z1 - z0).toFixed(4)})*(on/(${Math.round(seconds * FPS)}))`
  const vf =
    `scale=3200:-2,` +
    `zoompan=z='${zExpr}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},` +
    `format=yuv420p` +
    (label
      ? `,drawtext=fontfile=${fontfile}:text='${label}':fontcolor=0xd9ae45:fontsize=17:` +
        `x=52:y=h-56:box=1:boxcolor=0x000000@0.55:boxborderw=12`
      : '')
  execFileSync('ffmpeg', ['-y', '-v', 'error',
    '-stream_loop', srcDur < seconds ? '-1' : '0', '-i', src,
    '-t', seconds.toFixed(3),
    '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out])
}

const clipList = []
for (let i = 0; i < SCENES.length; i++) {
  const s = SCENES[i]
  const st = sceneTimes[i]
  const clip = join(WORK, `clip-${String(i).padStart(2, '0')}-${s.id}.mp4`)
  process.stdout.write(`  clip ${s.id} (${st.dur.toFixed(1)}s)… `)
  if (s.title) titleCard(s.title, st.dur, clip)
  else shotClip(s.shot, st.dur, s.push ?? [1, 1.08], s.label ?? '', clip)
  console.log('ok')
  clipList.push(clip)
}

// concat video, then mux the mixed audio
const vList = join(WORK, 'clips.txt')
writeFileSync(vList, clipList.map((p) => `file '${p}'`).join('\n'))
const silentVideo = join(WORK, 'video-concat.mp4')
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', vList,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', silentVideo])

const final = join(OUT, 'marque-demo.mp4')
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', silentVideo, '-i', mix,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest',
  '-movflags', '+faststart', final])

console.log(`\n✓ ${final}`)
execFileSync('ffprobe', ['-v', 'error', '-show_entries',
  'format=duration:stream=width,height,codec_name', '-of', 'default=nw=1', final], { stdio: 'inherit' })
