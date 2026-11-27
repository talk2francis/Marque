#!/usr/bin/env node
// Retention for the encrypted offsite dumps (marque-*.sql.gz.age, charters-*.sql.gz.age).
//
// Keeps, per prefix:
//   - the newest copy of each of the newest 14 days that have a copy,
//   - the newest copy of each of the newest 8 ISO weeks that have a copy,
//   - the earliest copy of every calendar month, forever.
// Everything else is deleted from the remote. Counting is by the copies that exist, not by the
// wall clock, so a stretch of failed uploads never ages out the last good copies. Names that do
// not match the dump pattern are never touched. Every dump is a full copy of an append-only
// record (AGENTS.md invariant 12), so a newer copy holds what an older one held; the monthly
// copies guard against a fault that goes unnoticed for weeks.
//
// pg-backup.sh runs this only after the night's upload verified. Google Drive moves deleted
// files to its trash, which empties itself after 30 days.
//
// Usage: node ops/backup-retention.mjs --remote <rclone-remote:path> [--apply] [--config <rclone.conf>]
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const POLICY = Object.freeze({ daily: 14, weekly: 8 })
const NAME = /^(marque|charters)-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.sql\.gz\.age$/

function parse(name) {
  const m = NAME.exec(name)
  if (!m) return null
  const [, prefix, y, mo, d, h, mi, s] = m
  const at = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
  if (Number.isNaN(at)) return null
  return { name, prefix, at, day: `${y}-${mo}-${d}`, month: `${y}-${mo}`, week: isoWeek(at) }
}

/** ISO 8601 week key, e.g. 2026-W48. */
export function isoWeek(ms) {
  const d = new Date(ms)
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const year = t.getUTCFullYear()
  const week = Math.ceil(((t - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Which remote names to keep and which to delete. Pure. */
export function plan(names, policy = POLICY) {
  const keep = new Set()
  const ignored = []
  const groups = new Map()
  for (const n of names) {
    const p = parse(n)
    if (!p) { ignored.push(n); continue }
    if (!groups.has(p.prefix)) groups.set(p.prefix, [])
    groups.get(p.prefix).push(p)
  }
  for (const list of groups.values()) {
    const newest = [...list].sort((a, b) => b.at - a.at)
    const pickNewest = (key, limit) => {
      const seen = new Set()
      for (const e of newest) {
        if (seen.has(e[key])) continue
        if (seen.size >= limit) break
        seen.add(e[key]); keep.add(e.name)
      }
    }
    pickNewest('day', policy.daily)
    pickNewest('week', policy.weekly)
    const firstOfMonth = new Map()
    for (const e of [...newest].reverse()) if (!firstOfMonth.has(e.month)) firstOfMonth.set(e.month, e.name)
    for (const n of firstOfMonth.values()) keep.add(n)
  }
  const matched = [...groups.values()].flat().map((e) => e.name)
  return {
    keep: matched.filter((n) => keep.has(n)).sort(),
    delete: matched.filter((n) => !keep.has(n)).sort(),
    ignored: ignored.sort(),
  }
}

function args(argv) {
  const out = { apply: false, remote: null, config: '/root/.marque/rclone.conf' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true
    else if (argv[i] === '--remote') out.remote = argv[++i]
    else if (argv[i] === '--config') out.config = argv[++i]
  }
  return out
}

function main() {
  const a = args(process.argv.slice(2))
  if (!a.remote) { console.error('usage: backup-retention.mjs --remote <remote:path> [--apply]'); process.exit(2) }
  const rclone = (...x) => execFileSync('rclone', ['--config', a.config, ...x], { encoding: 'utf8' })
  const names = rclone('lsf', '--files-only', a.remote).split('\n').map((s) => s.trim()).filter(Boolean)
  const p = plan(names)
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  console.log(`${stamp} retention: ${p.keep.length} kept, ${p.delete.length} to delete, ${p.ignored.length} other files untouched${a.apply ? '' : ' (dry run)'}`)
  // Safety: refuse any plan that would delete a prefix's newest copy (names sort by time).
  for (const prefix of ['marque', 'charters']) {
    const all = [...p.keep, ...p.delete].filter((n) => n.startsWith(`${prefix}-`)).sort()
    if (all.length && !p.keep.includes(all.at(-1))) { console.error(`refusing: plan would delete the newest ${prefix} copy`); process.exit(1) }
  }
  for (const n of p.delete) {
    if (a.apply) { rclone('deletefile', `${a.remote}/${n}`); console.log(`${stamp} retention: deleted ${n}`) }
    else console.log(`${stamp} retention: would delete ${n}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
