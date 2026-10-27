#!/usr/bin/env node
/**
 * Verify the launch film's media against apps/web/lib/film-media.json (the manifest the site
 * plays from). Run it after unpacking the film pack, after every Caddy change, and after deploy.
 *
 *   node scripts/film-verify.mjs --dir /var/www/marque-media/film     files: present, sizes, SHA-256
 *   node scripts/film-verify.mjs --url https://marque.trade           HTTP: types, ranges, caching, pages
 *
 * Exits 1 on any failure and says which. Reads nothing secret and writes nothing.
 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const media = JSON.parse(readFileSync(join(root, 'apps/web/lib/film-media.json'), 'utf8'))
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null }
const dir = arg('dir')
const url = arg('url')
if (!dir && !url) { console.error('usage: --dir <media dir> and/or --url <origin>'); process.exit(64) }

const files = []
for (const [key, v] of Object.entries(media.variants)) {
  for (const k of ['av1', 'h264', 'storyboard']) files.push({ ...v[k], what: `${key} ${k}` })
}
for (const kind of ['avif', 'webp', 'jpg']) for (const p of media.poster[kind]) files.push({ file: p.file, what: `poster ${p.w} ${kind}` })

let failed = 0
const ok = (m) => console.log(`  ok    ${m}`)
const bad = (m) => { failed++; console.log(`  FAIL  ${m}`) }
const sha = (p) => new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(p).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej) })

if (dir) {
  console.log(`Files in ${dir}`)
  for (const f of files) {
    const p = join(dir, f.file)
    if (!existsSync(p)) { bad(`${f.what}: missing ${f.file}`); continue }
    if (f.bytes && statSync(p).size !== f.bytes) { bad(`${f.what}: ${statSync(p).size} bytes, manifest says ${f.bytes}`); continue }
    if (f.sha256 && (await sha(p)) !== f.sha256) { bad(`${f.what}: SHA-256 differs from the manifest`); continue }
    ok(`${f.what}  ${f.file}`)
  }
  const known = new Set(files.map((f) => f.file).concat(['SHA256SUMS']))
  const extra = readdirSync(dir).filter((n) => !known.has(n))
  if (extra.length) console.log(`  note  not in the manifest (left alone): ${extra.join(', ')}`)
}

if (url) {
  const origin = url.replace(/\/$/, '')
  console.log(`HTTP at ${origin}`)
  const want = { mp4: 'video/mp4', webp: 'image/webp', avif: 'image/avif', jpg: 'image/jpeg' }
  for (const f of files) {
    const ext = f.file.split('.').pop()
    const r = await fetch(`${origin}${media.base}${f.file}`, { method: 'HEAD' }).catch(() => null)
    if (!r) { bad(`${f.what}: no response`); continue }
    const ct = r.headers.get('content-type') ?? ''
    const cc = r.headers.get('cache-control') ?? ''
    const ce = r.headers.get('content-encoding')
    if (r.status !== 200) { bad(`${f.what}: HTTP ${r.status}`); continue }
    if (!ct.startsWith(want[ext])) { bad(`${f.what}: content-type ${ct || 'none'}, want ${want[ext]}`); continue }
    if (!/immutable/.test(cc) || !/max-age=31536000/.test(cc)) { bad(`${f.what}: cache-control "${cc}", want public, max-age=31536000, immutable`); continue }
    if (ce) { bad(`${f.what}: content-encoding ${ce} (media must not be recompressed)`); continue }
    if (f.bytes && Number(r.headers.get('content-length')) !== f.bytes) { bad(`${f.what}: content-length ${r.headers.get('content-length')}, manifest ${f.bytes}`); continue }
    ok(`${f.what}`)
  }
  // Seeking needs byte ranges (Safari will not play without them).
  const mp4 = media.variants.d9.h264.file
  const rr = await fetch(`${origin}${media.base}${mp4}`, { headers: { Range: 'bytes=1000-1999' } })
  const body = rr.ok ? Buffer.from(await rr.arrayBuffer()) : Buffer.alloc(0)
  if (rr.status === 206 && body.length === 1000) ok('byte ranges: 206 with exactly the requested bytes')
  else bad(`byte ranges: HTTP ${rr.status}, ${body.length} bytes`)
  // faststart: the moov box sits before the media data, so playback starts on the first bytes.
  const head = await fetch(`${origin}${media.base}${mp4}`, { headers: { Range: 'bytes=0-65535' } }).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b)).catch(() => Buffer.alloc(0))
  const moov = head.indexOf('moov'), mdat = head.indexOf('mdat')
  if (moov > 0 && (mdat < 0 || moov < mdat)) ok('faststart: moov before mdat')
  else bad('faststart: moov is not at the front')
  for (const [path, check] of [
    ['/film/chapters.vtt', (r, t) => r.status === 200 && t.startsWith('WEBVTT') && /text\/vtt/.test(r.headers.get('content-type') ?? '')],
    ['/film', (r, t) => r.status === 200 && t.includes('id="film"') && t.includes('application/ld+json')],
    ['/', (r, t) => r.status === 200 && t.includes('id="film"') && t.includes('Watch the film')],
    ['/jobs/56/56903', (r) => r.status === 200],
  ]) {
    const r = await fetch(`${origin}${path}`)
    const t = await r.text()
    if (check(r, t)) ok(`page ${path}`)
    else bad(`page ${path}: HTTP ${r.status}, content not as expected`)
  }
  const csp = (await fetch(`${origin}/`, { method: 'HEAD' })).headers.get('content-security-policy') ?? ''
  if (/media-src 'self'/.test(csp)) ok("CSP has media-src 'self'")
  else bad("CSP lacks media-src 'self'")
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
