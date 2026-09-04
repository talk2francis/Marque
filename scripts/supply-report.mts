/**
 * Generates docs/SUPPLY-OUTREACH.md plus JSON and CSV siblings.
 *
 * Run:  pnpm tsx scripts/supply-report.mts
 *
 * Every number is measured at generation time and stamped with when. Marque
 * reference agents are excluded from every third-party count by construction.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { funnel, categoryFunnel, failureHistogram, buildProspects, rollupByOwner, REQUIRED_CATEGORIES, MIN_THIRD_PARTY_PER_CATEGORY, MARQUE_REFERENCE_OWNERS } from '@marque/registry'
import { db, closeDb } from '@marque/db'
import { sql } from 'drizzle-orm'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOCS = join(HERE, '..', 'docs')

const CATEGORY_LABEL: Record<string, string> = {
  rebalancing: 'Rebalancing',
  grid: 'Grid Trading',
  yield: 'Yield Optimisation',
  health_factor: 'Health Factor',
  security: 'Security (TermiX high-stakes)',
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 180)
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return `"${s.replace(/"/g, '""').replace(/\n/g, ' ')}"`
}

async function censusCoverage(): Promise<{ enriched: number; candidates: number; indexed: number; registered: number }> {
  const d = db()
  const rows = await d.execute(sql`
    select
      (select count(*) from agent where chain_id = 56) as indexed,
      (select count(*) from agent where chain_id = 56 and detail_fetched) as enriched,
      (select count(*) from agent where chain_id = 56 and (x402_supported
         or supported_protocols::text ilike '%a2a%'
         or supported_protocols::text ilike '%mcp%')) as candidates,
      (select coalesce(max(count), 0) from funnel_snapshot where stage = 'registered') as registered
  `)
  const r = (((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]))[0] ?? {}) as Record<string, unknown>
  return {
    indexed: Number(r['indexed'] ?? 0),
    enriched: Number(r['enriched'] ?? 0),
    candidates: Number(r['candidates'] ?? 0),
    registered: Number(r['registered'] ?? 0),
  }
}

async function main(): Promise<void> {
  const takenAt = new Date().toISOString()
  const [stages, categories, failures, prospects, coverage] = await Promise.all([
    funnel(56), categoryFunnel(56), failureHistogram(), buildProspects({ limit: 3000 }), censusCoverage(),
  ])
  const owners = rollupByOwner(prospects)

  const byCat = new Map(categories.map((c) => [c.category, c]))
  const gaps = REQUIRED_CATEGORIES.filter((c) => (byCat.get(c)?.thirdPartyExecutable ?? 0) < MIN_THIRD_PARTY_PER_CATEGORY)

  // Distinct executable services, not registrations. One operator registering
  // the same endpoint 35 times is one supplier, and counting it as 35 would be
  // exactly the inflation this report exists to prevent.
  const liveProspects = prospects.filter((p) => p.liveness === 'live')
  const distinctLiveHosts = new Set(
    liveProspects.flatMap((p) => p.endpoints.map((e) => {
      try { return new URL(e.url).host } catch { return e.url }
    })),
  )

  const pct = (n: number, d: number): string => (d > 0 ? `${((n / d) * 100).toFixed(2)}%` : 'n/a')

  const lines: string[] = []
  lines.push('# Supply outreach')
  lines.push('')
  lines.push(`> Generated ${takenAt} · chain 56 · every number measured, none hardcoded.`)
  lines.push('> Regenerate with `pnpm tsx scripts/supply-report.mts`.')
  lines.push('')
  lines.push('Marque reference agents are excluded from every third-party count in this')
  lines.push(`document by construction (${MARQUE_REFERENCE_OWNERS.length} reference owner(s) registered).`)
  lines.push('')

  lines.push('## Census coverage — read this before trusting the counts')
  lines.push('')
  lines.push(`The detail-enrichment pass is **${pct(coverage.enriched, coverage.candidates)} complete**`)
  lines.push(`(${coverage.enriched.toLocaleString()} of ${coverage.candidates.toLocaleString()} agents that declare a transport).`)
  lines.push('Service endpoints exist only on the detail record, so an agent that has not been')
  lines.push('enriched yet cannot appear as supply. **These are lower bounds, and they will rise.**')
  lines.push('')
  lines.push(`- Indexed on BSC so far: **${coverage.indexed.toLocaleString()}**`)
  lines.push(`- Registered on BSC (registry total): **${coverage.registered.toLocaleString()}**`)
  lines.push('')

  lines.push('## Funnel')
  lines.push('')
  lines.push('| Stage | Count | How measured |')
  lines.push('|---|---:|---|')
  for (const s of stages) lines.push(`| ${s.label} | ${s.count.toLocaleString()} | ${s.method} |`)
  lines.push('')

  lines.push('## Per-category supply')
  lines.push('')
  lines.push('| Category | Registered (classified) | Has service metadata | Reachable now | Third-party executable | Marque reference | Status |')
  lines.push('|---|---:|---:|---:|---:|---:|---|')
  for (const cat of [...REQUIRED_CATEGORIES, 'security']) {
    const c = byCat.get(cat as string)
    const label = CATEGORY_LABEL[cat as string] ?? String(cat)
    if (!c) {
      lines.push(`| ${label} | 0 | 0 | 0 | 0 | 0 | **SUPPLY_GAP** |`)
      continue
    }
    const status = c.thirdPartyExecutable < MIN_THIRD_PARTY_PER_CATEGORY ? '**SUPPLY_GAP**' : 'ok'
    lines.push(`| ${label} | ${c.classified} | ${c.hasServiceMetadata} | ${c.reachableNow} | **${c.thirdPartyExecutable}** | ${c.referenceAgents} | ${status} |`)
  }
  lines.push('')
  lines.push(`**Threshold:** a required category with fewer than ${MIN_THIRD_PARTY_PER_CATEGORY} reachable third-party agents is flagged SUPPLY_GAP.`)
  lines.push('')
  if (gaps.length > 0) {
    lines.push(`> **SUPPLY_GAP in ${gaps.length} of ${REQUIRED_CATEGORIES.length} required categories:** ${gaps.map((g) => CATEGORY_LABEL[g as string] ?? g).join(', ')}.`)
    lines.push('')
  }

  lines.push('## Distinct executable supply')
  lines.push('')
  lines.push(`- Live service **registrations**: ${liveProspects.length}`)
  lines.push(`- Distinct live **hosts**: **${distinctLiveHosts.size}** ${distinctLiveHosts.size > 0 ? `(${[...distinctLiveHosts].join(', ')})` : ''}`)
  lines.push('')
  lines.push('Registrations overstate supply. One operator can register the same endpoint')
  lines.push('many times under different ERC-8004 identities, and on BSC one does. The host')
  lines.push('count is the number that reflects how many suppliers actually exist.')
  lines.push('')

  lines.push('## How BSC agents fail')
  lines.push('')
  lines.push('| Failure class | Count | Share |')
  lines.push('|---|---:|---:|')
  for (const f of failures) lines.push(`| \`${f.failureClass}\` | ${f.count} | ${(f.share * 100).toFixed(1)}% |`)
  lines.push('')

  lines.push('## Top owners to contact')
  lines.push('')
  lines.push('Ranked by what one conversation could unlock: live supply first, then')
  lines.push('portfolio size, because an owner who binds one runtime can activate many agents.')
  lines.push('')
  lines.push('Owners whose every endpoint is already covered by someone ranked above them')
  lines.push('are marked `dup` — they are the same supplier reached through another identity.')
  lines.push('')
  lines.push('| # | Owner | Agent | Agents | Live | Unbound | Categories | Host | Contact | Why contact them | Priority |')
  lines.push('|---:|---|---|---:|---:|---:|---|---|---|---|---|')
  const ranked = owners.filter((o) => !o.duplicateSupplier)
  ranked.slice(0, 20).forEach((o, i) => {
    const contact = [o.contacts.x, o.contacts.github, o.contacts.website, o.contacts.email]
      .filter(Boolean).slice(0, 2).join(' · ') || '—'
    lines.push(`| ${i + 1} | \`${o.ownerAddress}\` | ${esc(o.topAgentName)} | ${o.agentCount} | ${o.liveCount} | ${o.unboundCount} | ${o.categories.join(', ') || '—'} | ${esc(o.hosts.slice(0, 1).join(''))} | ${esc(contact)} | ${esc(o.whyContact)} | ${o.priority} |`)
  })
  lines.push('')
  lines.push(`Suppressed as duplicate suppliers: ${owners.length - ranked.length} owner(s) pointing at hosts already listed above.`)
  lines.push('')

  lines.push('## Prospect records')
  lines.push('')
  lines.push('Full records in `SUPPLY-OUTREACH.json` and `SUPPLY-OUTREACH.csv`.')
  lines.push('')
  for (const cat of [...REQUIRED_CATEGORIES, 'security', 'unclassified']) {
    const inCat = prospects.filter((p) => p.category === cat)
    if (inCat.length === 0) continue
    lines.push(`### ${CATEGORY_LABEL[cat as string] ?? 'Unclassified'} — ${inCat.length} prospect(s)`)
    lines.push('')
    lines.push('| Agent | ERC-8004 ID | Owner | Protocol | Liveness | Why it is / is not ready | Priority |')
    lines.push('|---|---|---|---|---|---|---|')
    for (const p of inCat.slice(0, 30)) {
      const proto = p.endpoints.map((e) => e.kind).join(', ') || (p.protocols.join(', ') || '—')
      const live = p.liveness ?? 'unprobed'
      lines.push(`| ${esc(p.name) || '(unnamed)'} | \`${p.tokenId}\` | \`${(p.ownerAddress ?? '—').slice(0, 12)}…\` | ${proto} | ${live}${p.latencyMs !== null ? ` (${p.latencyMs}ms)` : ''} | ${esc(p.readiness)} | ${p.priority} |`)
    }
    lines.push('')
  }

  mkdirSync(DOCS, { recursive: true })
  writeFileSync(join(DOCS, 'SUPPLY-OUTREACH.md'), lines.join('\n'))
  writeFileSync(
    join(DOCS, 'SUPPLY-OUTREACH.json'),
    JSON.stringify({ takenAt, coverage, stages, categories, failures, owners, prospects }, null, 2),
  )

  const header = ['priority', 'category', 'name', 'erc8004_token_id', 'agent_id', 'owner_address', 'agent_wallet', 'protocols', 'endpoint', 'liveness', 'latency_ms', 'failure_class', 'skills', 'website', 'x', 'github', 'email', 'owner_agent_count', 'readiness']
  const csv = [header.join(',')]
  for (const p of prospects) {
    csv.push([
      p.priority, p.category, p.name, p.tokenId, p.agentId, p.ownerAddress, p.agentWallet,
      p.protocols.join(' '), p.endpoints[0]?.url ?? '', p.liveness, p.latencyMs, p.failureClass,
      p.skills.slice(0, 8).join(' '), p.contacts.website, p.contacts.x, p.contacts.github,
      p.contacts.email, p.ownerAgentCount, p.readiness,
    ].map(csvCell).join(','))
  }
  writeFileSync(join(DOCS, 'SUPPLY-OUTREACH.csv'), csv.join('\n'))

  console.log(JSON.stringify({
    takenAt,
    coveragePct: pct(coverage.enriched, coverage.candidates),
    prospects: prospects.length,
    owners: owners.length,
    liveRegistrations: liveProspects.length,
    distinctLiveHosts: distinctLiveHosts.size,
    supplyGaps: gaps,
  }, null, 2))

  await closeDb()
}

main().catch((err) => { console.error(err); process.exit(1) })
