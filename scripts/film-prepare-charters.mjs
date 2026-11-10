#!/usr/bin/env node
// Reproducible media manifest generation. Large assets stay outside git.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const sharp = require('sharp')
const input = resolve(process.argv[2] ?? '/root/charters-film')
const output = resolve(process.argv[3] ?? '/root/.maintenance/marque-charters-followup-20261110/film-media')
mkdirSync(output, { recursive: true })
const source = join(input, 'marque-charters-draw-the-line-v2-1080p60.mp4')
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const expected = readFileSync(join(input, 'SHA256SUMS'), 'utf8').trim().split(/\s+/)[0]
if (hash(source) !== expected) throw Error('Uploaded film checksum mismatch')
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-threads', '2', ...args], { stdio: 'inherit' })
const file = (path, stem, ext) => {
  const sha256 = hash(path), name = `${stem}.${sha256.slice(0, 10)}.${ext}`
  copyFileSync(path, join(output, name))
  return { file: name, bytes: statSync(path).size, sha256 }
}
const h264 = join(output, 'charters-working.h264.mp4')
const av1 = join(output, 'charters-working.av1.mp4')
ff(['-i', source, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', h264])
ff(['-i', source, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libsvtav1', '-preset', '12', '-crf', '30', '-pix_fmt', 'yuv420p10le', '-svtav1-params', 'lp=2', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', av1])
const sprite = join(output, 'charters-working.webp')
ff(['-i', source, '-vf', 'fps=1,scale=192:108,tile=10x7', '-frames:v', '1', '-threads', '2', '-c:v', 'libwebp', '-quality', '85', sprite])
const poster = { avif: [], webp: [], jpg: [] }
for (const w of [480, 800, 1280, 1920]) for (const kind of Object.keys(poster)) {
  const path = join(output, `poster-working-${w}.${kind}`)
  const image = sharp(join(input, 'poster-title.png')).resize(w)
  await (kind === 'avif' ? image.avif({ quality: 55, effort: 5 }) : kind === 'webp' ? image.webp({ quality: 82 }) : image.jpeg({ quality: 85, mozjpeg: true })).toFile(path)
  poster[kind].push({ w, ...file(path, `charters-poster-${w}`, kind) })
}
const ogPath = join(output, 'og-working.jpg')
await sharp(join(input, 'poster-end.png')).resize(1920).jpeg({ quality: 90, mozjpeg: true }).toFile(ogPath)
const manifestPath = join(root, 'apps/web/lib/film-media.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.charters = {
  base: manifest.base, codecs: manifest.codecs, storyboard: manifest.storyboard,
  variants: { main: { h264: file(h264, 'draw-the-line', 'h264.mp4'), av1: file(av1, 'draw-the-line', 'av1.mp4'), storyboard: file(sprite, 'charters-storyboard', 'webp') } },
  poster, og: file(ogPath, 'charters-end', 'jpg'), sourceSha256: expected,
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n')
writeFileSync(join(output, 'charters-manifest.json'), JSON.stringify(manifest.charters, null, 2) + '\n')
console.log('Generated Charters assets and manifest; launch media entries preserved.')
