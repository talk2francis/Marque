SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- Prepare CONCURRENTLY in production first. This matches all three existing
-- classifier readers without changing their predicates or observation order.
CREATE INDEX IF NOT EXISTS "probe_agent_skills_checked_idx" ON "probe" USING btree ("agent_id", "checked_at" DESC NULLS FIRST) WHERE jsonb_array_length("skills") > 0;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indexrelid = 'probe_agent_skills_checked_idx'::regclass
      AND i.indisvalid AND i.indisready
      AND pg_get_indexdef(i.indexrelid) LIKE '%ON public.probe USING btree (agent_id, checked_at DESC)%'
      AND pg_get_expr(i.indpred, i.indrelid) = '(jsonb_array_length(skills) > 0)'
  ) THEN
    RAISE EXCEPTION 'Prepare and validate probe_agent_skills_checked_idx concurrently before migration registration';
  END IF;
END $$;
