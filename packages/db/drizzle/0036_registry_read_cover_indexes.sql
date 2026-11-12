SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- Prepare CONCURRENTLY in production before registering this migration.
-- These nonunique indexes preserve every identity, observation and query predicate.
CREATE INDEX IF NOT EXISTS "agent_id_chain_cover_idx" ON "agent" USING btree ("id", "chain_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_category_latest_cover_idx" ON "agent_category" USING btree ("agent_id", ("category" <> 'unclassified') DESC, "confidence" DESC, "assigned_at" DESC, "category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_quote_created_idx" ON "commerce_quote" USING btree ("created_at" DESC);
--> statement-breakpoint
DO $$
BEGIN
  IF (
    SELECT count(*) FROM (VALUES
      ('agent_id_chain_cover_idx', 'CREATE INDEX agent_id_chain_cover_idx ON public.agent USING btree (id, chain_id)'),
      ('agent_category_latest_cover_idx', 'CREATE INDEX agent_category_latest_cover_idx ON public.agent_category USING btree (agent_id, ((category <> ''unclassified''::text)) DESC, confidence DESC, assigned_at DESC, category)'),
      ('commerce_quote_created_idx', 'CREATE INDEX commerce_quote_created_idx ON public.commerce_quote USING btree (created_at DESC)')
    ) expected(name, definition)
    JOIN pg_index i ON i.indexrelid = to_regclass('public.' || expected.name)
    WHERE i.indisvalid AND i.indisready AND NOT i.indisunique AND NOT i.indisprimary
      AND i.indpred IS NULL AND pg_get_indexdef(i.indexrelid) = expected.definition
  ) <> 3 THEN
    RAISE EXCEPTION 'Prepare and validate the three registry read indexes concurrently before migration registration';
  END IF;
END $$;
