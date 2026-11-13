SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- Prepare CONCURRENTLY in production before registering this migration.
-- Additive, nonunique indexes only; no observation or eligibility changes.
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS commerce_quote_ok_created_agent_cover_idx ON public.commerce_quote USING btree (created_at DESC, agent_id) WHERE ok;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS probe_schedule_last_probe_cover_idx ON public.probe_schedule USING btree (last_probe_id, service_id) INCLUDE (agent_id) WHERE (last_probe_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS commerce_quote_agent_history_cover_idx ON public.commerce_quote USING btree (agent_id, created_at DESC) INCLUDE (ok);
--> statement-breakpoint
DO $$
BEGIN
  IF (
    SELECT count(*) FROM (VALUES
      ('commerce_quote_ok_created_agent_cover_idx', 'CREATE INDEX commerce_quote_ok_created_agent_cover_idx ON public.commerce_quote USING btree (created_at DESC, agent_id) WHERE ok'),
      ('probe_schedule_last_probe_cover_idx', 'CREATE INDEX probe_schedule_last_probe_cover_idx ON public.probe_schedule USING btree (last_probe_id, service_id) INCLUDE (agent_id) WHERE (last_probe_id IS NOT NULL)'),
      ('commerce_quote_agent_history_cover_idx', 'CREATE INDEX commerce_quote_agent_history_cover_idx ON public.commerce_quote USING btree (agent_id, created_at DESC) INCLUDE (ok)')
    ) expected(name, definition)
    JOIN pg_index i ON i.indexrelid = to_regclass('public.' || expected.name)
    WHERE i.indisvalid AND i.indisready AND NOT i.indisunique AND NOT i.indisprimary
      AND pg_get_indexdef(i.indexrelid) = expected.definition
  ) <> 3 THEN
    RAISE EXCEPTION 'Prepare and validate the three quote/probe read indexes concurrently before migration registration';
  END IF;
END $$;
