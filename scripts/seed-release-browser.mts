/** Candidate-only deterministic data for browser release gates. Never production. */
import postgres from 'postgres'

const url = process.env.MARQUE_CANDIDATE_DATABASE_URL
if (!url) throw new Error('MARQUE_CANDIDATE_DATABASE_URL required')
const parsed = new URL(url)
if (parsed.pathname !== '/marque_release_verify_20260921') throw new Error('refusing to seed outside the release candidate database')
const sql = postgres(url, { max: 1 })
const registry = '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432'
const now = new Date()

await sql.begin(async (tx) => {
  for (const row of [
    { id: `56:${registry}:2468`, token: '2468', name: 'ClawdMint release fixture', owner: '0x75b583c518215e272f3c0a3bcc1b27012f294adc' },
    { id: `56:${registry}:900001`, token: '900001', name: 'Compatible release fixture', owner: '0x0000000000000000000000000000000000090001' },
  ]) {
    await tx`insert into agent (id,chain_id,token_id,contract_address,owner_address,name,detail_fetched,detail_fetched_at)
      values (${row.id},56,${row.token},${registry},${row.owner},${row.name},true,${now}) on conflict (id) do update set name=excluded.name,detail_fetched=true,detail_fetched_at=excluded.detail_fetched_at`
    await tx`insert into agent_category (agent_id,category,confidence,method,rationale)
      values (${row.id},'yield',1,'owner_declared','release browser fixture') on conflict (agent_id,category) do update set confidence=excluded.confidence`
  }
  const [card] = await tx`insert into agent_service (agent_id,kind,endpoint,source)
    values (${`56:${registry}:2468`},'a2a','https://clawdmint-api.vercel.app/.well-known/agent-card.json','top_level')
    on conflict (agent_id,kind,endpoint) do update set last_seen=now() returning id`
  const [mcp] = await tx`insert into agent_service (agent_id,kind,endpoint,source)
    values (${`56:${registry}:900001`},'mcp','https://fixture.invalid/mcp','top_level')
    on conflict (agent_id,kind,endpoint) do update set last_seen=now() returning id`
  await tx`insert into probe (agent_id,service_id,checked_at,ok,liveness,failure_class,detail,skills,executable_endpoint,task_kinds,manifest)
    values (${`56:${registry}:2468`},${card!.id},${now},false,'unbound','unbound','card readable only',${['Yield Optimizer']},'https://clawdmint.vercel.app',${[]},${{ capabilityEvidence: { cardReadable: true, endpointDiscovered: true, endpointReachable: null, messageSendCallable: null, taskCompatible: [] } }})`
  await tx`insert into probe (agent_id,service_id,checked_at,ok,liveness,detail,skills,executable_endpoint,task_kinds,manifest)
    values (${`56:${registry}:900001`},${mcp!.id},${now},true,'live','one compatible tool',${['yield_plan']},'https://fixture.invalid/mcp',${['yield']},${{ tools: [{ name: 'yield_plan', inputSchema: { type: 'object', properties: { policy: { type: 'object' } }, required: ['policy'] } }] }})`
})
await sql.end()
console.log('seeded release browser fixtures in marque_release_verify_20260921')
