/** Write docs/site/*.md from the website's own documentation data (apps/web/lib/site-docs.ts). */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { siteDocs } from '../apps/web/lib/site-docs'

const dir = join(import.meta.dirname, '..', 'docs', 'site')
mkdirSync(dir, { recursive: true })
for (const f of siteDocs()) writeFileSync(join(dir, f.path), f.content)
console.log(`wrote ${siteDocs().length} files to docs/site`)
