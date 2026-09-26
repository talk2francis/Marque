#!/usr/bin/env node
// lint:copy — no em dash (U+2014) or en dash (U+2013) in user-facing copy.
//
// Scope: string literals and JSX text in apps/web/**/*.tsx, README.md, docs/**/*.md.
// Comments in .tsx are not copy and are ignored.
//
// Ratchet: historical files are not mass-edited (AGENTS 13.6). Their current counts live in
// scripts/lint-copy-baseline.json. A file fails if its count rises above its baseline, or if it
// is not in the baseline and has any. Files under docs/phase2/ are held to zero regardless.
// Touch a file, clean it, then run `node scripts/lint-copy.mjs --update` to lower its baseline.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASELINE = path.join(ROOT, 'scripts/lint-copy-baseline.json');
const DASH = /[–—]/g;

function files() {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'apps/web', 'README.md', 'docs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => (f.startsWith('apps/web/') ? f.endsWith('.tsx') : f === 'README.md' || f.endsWith('.md')))
    .filter((f) => existsSync(path.join(ROOT, f)));
}

function countTsx(src, file) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits = [];
  const visit = (node) => {
    const k = node.kind;
    if (
      k === ts.SyntaxKind.StringLiteral ||
      k === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      k === ts.SyntaxKind.TemplateHead ||
      k === ts.SyntaxKind.TemplateMiddle ||
      k === ts.SyntaxKind.TemplateTail ||
      k === ts.SyntaxKind.JsxText
    ) {
      const text = node.getText(sf);
      const m = text.match(DASH);
      if (m) hits.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, n: m.length });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function countText(src) {
  const hits = [];
  src.split('\n').forEach((l, i) => {
    const m = l.match(DASH);
    if (m) hits.push({ line: i + 1, n: m.length });
  });
  return hits;
}

const update = process.argv.includes('--update');
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const counts = {};
let total = 0;
const failures = [];

for (const f of files()) {
  const src = readFileSync(path.join(ROOT, f), 'utf8');
  const hits = f.endsWith('.tsx') ? countTsx(src, f) : countText(src);
  const n = hits.reduce((a, h) => a + h.n, 0);
  if (!n) continue;
  counts[f] = n;
  total += n;
  const allowed = f.startsWith('docs/phase2/') ? 0 : (baseline[f] ?? 0);
  if (n > allowed) failures.push({ f, n, allowed, lines: hits.map((h) => h.line) });
}

if (update) {
  // Only ever lowers or removes entries; never raises one (that would defeat the ratchet).
  const next = {};
  for (const [f, n] of Object.entries(counts)) {
    if (f.startsWith('docs/phase2/')) continue;
    const prev = baseline[f];
    if (prev === undefined && !process.argv.includes('--init')) continue;
    next[f] = prev === undefined ? n : Math.min(prev, n);
  }
  writeFileSync(BASELINE, JSON.stringify(next, Object.keys(next).sort(), 2) + '\n');
  console.log(`lint:copy baseline written: ${Object.keys(next).length} files, ${Object.values(next).reduce((a, b) => a + b, 0)} dashes`);
  process.exit(0);
}

console.log(`lint:copy: ${total} em/en dashes across ${Object.keys(counts).length} files (baseline allows ${Object.values(baseline).reduce((a, b) => a + b, 0)})`);
if (failures.length) {
  for (const x of failures) console.error(`  ${x.f}: ${x.n} dashes (allowed ${x.allowed}) at lines ${x.lines.slice(0, 12).join(', ')}`);
  console.error('lint:copy FAILED: replace the dash with a comma, colon, full stop or parentheses.');
  process.exit(1);
}
console.log('lint:copy OK');
