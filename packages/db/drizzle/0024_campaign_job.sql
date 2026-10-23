SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_job" (
	"chain_id" integer NOT NULL,
	"job_id" text NOT NULL,
	"client" text NOT NULL,
	"provider" text NOT NULL,
	"evaluator" text,
	"hook" text,
	"budget_raw" text,
	"status" integer NOT NULL,
	"status_name" text NOT NULL,
	"expired_at" bigint,
	"description" text NOT NULL,
	"description_hash" text NOT NULL,
	"created_at" timestamp with time zone,
	"funded_at" timestamp with time zone,
	"funded_tx" text,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"marketplace" text,
	"attribution" text,
	"client_ref" text,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_job_chain_id_job_id_pk" PRIMARY KEY("chain_id","job_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_job_client_idx" ON "campaign_job" ("client");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_job_provider_idx" ON "campaign_job" ("chain_id","provider");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quest_watch" (
	"chat_id" text NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_state" jsonb,
	"sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "quest_watch_chat_id_address_pk" PRIMARY KEY("chat_id","address")
);
