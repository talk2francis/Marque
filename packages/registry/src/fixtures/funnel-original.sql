with base as (select id, detail_fetched, owner_address from agent where chain_id = $1),
    svc as (
      select distinct agent_id from agent_service
    ),
    latest_service_probe as (
      select ps.service_id, p.liveness, p.executable_endpoint, p.task_kinds, p.checked_at
      from probe_schedule ps join probe p on p.id = ps.last_probe_id
    ),
    service_state as (
      select s.agent_id,
        bool_or(p.liveness in ('live','discovered','unbound','bad_schema') and p.checked_at > now() - interval '24 hours') as reachable,
        bool_or(p.liveness = 'live' and p.executable_endpoint is not null
          and p.checked_at > now() - interval '24 hours' and s.kind in ('a2a','mcp')) as callable,
        bool_or(p.liveness = 'live' and p.executable_endpoint is not null
          and p.checked_at > now() - interval '24 hours' and s.kind in ('a2a','mcp')
          and jsonb_array_length(coalesce(p.task_kinds, '[]'::jsonb)) > 0) as compatible
      from agent_service s left join latest_service_probe p on p.service_id = s.id
      where s.currently_declared is distinct from false
      group by s.agent_id
    ),
    latest_category as (
      select distinct on (agent_id) agent_id, category
      from agent_category order by agent_id, (category <> 'unclassified') desc, confidence desc, assigned_at desc
    ),
    qualified as (
      -- The latest stored result passes: a test the agent has since failed does not qualify it.
      select agent_id from (
        select distinct on (agent_id) agent_id, pass from conformance_result order by agent_id, ran_at desc
      ) latest where pass
    ),
    hireable as (
      select distinct s.agent_id
      from agent_service s
      join latest_service_probe p on p.service_id = s.id
      join latest_category c on c.agent_id = s.agent_id
      where p.liveness = 'live' and p.executable_endpoint is not null
        and p.checked_at > now() - interval '24 hours' and s.kind in ('a2a','mcp')
        and p.task_kinds ? case c.category
          when 'rebalancing' then 'rebalance'
          when 'grid' then 'grid'
          when 'yield' then 'yield'
          when 'health_factor' then 'health_factor'
          else '__unsupported__' end
    )
    select
      (select count(*) from base) as registered,
      (select count(*) from base where detail_fetched = true) as metadata_readable,
      (select count(*) from base b join svc s on s.agent_id = b.id) as with_parseable_service,
      (select count(*) from base b join service_state s on s.agent_id = b.id where s.reachable) as reachable,
      (select count(*) from base b join service_state s on s.agent_id = b.id where s.callable) as callable,
      (select count(*) from base b join service_state s on s.agent_id = b.id where s.compatible) as compatible,
      (select count(*) from base b join qualified q on q.agent_id = b.id) as qualified,
      (select count(*) from base b join hireable h on h.agent_id = b.id) as hireable
