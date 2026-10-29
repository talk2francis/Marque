import 'server-only'
import { sql } from 'drizzle-orm'

/** Explicit NULLS LAST matches the observation indexes, so LIMIT bounds the read instead of a sort over all history. */
export const sellerServicesQuery = (agentKey: string) => sql`
      select s.id, s.kind, s.endpoint, s.resolved_endpoint, p.liveness, p.checked_at, p.executable_endpoint, p.manifest->>'url' as runtime_endpoint, history.last_good_at, history.last_bad_at,
        q.ok, q.failure, q.signed, q.provider, q.chain_id, q.quote_expires_at, q.created_at as quote_at,
        q.endpoint as quote_endpoint
      from agent_service s
      left join probe_schedule ps on ps.service_id = s.id and ps.agent_id = s.agent_id
      left join probe p on p.id = ps.last_probe_id
      left join lateral (select max(checked_at) filter (where ok) as last_good_at,
        max(checked_at) filter (where not ok and liveness is distinct from 'discovered'
          and not coalesce(liveness = 'unbound' and executable_endpoint is not null and detail like '%message/send not validated%', false)) as last_bad_at
        from (select ok, checked_at, liveness, executable_endpoint, detail from probe where service_id = s.id and agent_id = s.agent_id order by checked_at desc nulls last limit 100) recent) history on true
      left join lateral (select ok, failure, signed, provider, chain_id, quote_expires_at, created_at, endpoint
        from commerce_quote where agent_id = ${agentKey} and service_id = s.id and source = 'probe'
        order by created_at desc nulls last, id desc limit 1) q on true
      where s.agent_id = ${agentKey} order by (s.currently_declared is true) desc, s.id limit 17`
