SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outcome" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"job_key" text NOT NULL,
	"agent_key" text NOT NULL,
	"user_address" text NOT NULL,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"plan_json" jsonb NOT NULL,
	"simulated_after_json" jsonb NOT NULL,
	"tx_hashes" jsonb NOT NULL,
	"confirmed_block" text NOT NULL,
	"before_json" jsonb NOT NULL,
	"after_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_agent_idx" ON "outcome" ("agent_key","created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_job_idx" ON "outcome" ("job_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outcome_tx_uq" ON "outcome" ("chain_id","confirmed_block","user_address","action");
