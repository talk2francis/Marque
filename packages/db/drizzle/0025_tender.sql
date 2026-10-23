SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tender" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"chain_id" integer NOT NULL,
	"task_hash" text NOT NULL,
	"shape" jsonb NOT NULL,
	"asked" integer NOT NULL,
	"priced" integer DEFAULT 0 NOT NULL,
	"declined" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"source" text DEFAULT 'web' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tender_category_created_idx" ON "tender" ("category","created_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tender_quote" (
	"id" serial PRIMARY KEY NOT NULL,
	"tender_id" uuid NOT NULL REFERENCES "tender"("id"),
	"agent_id" text NOT NULL,
	"service_id" integer,
	"ok" boolean NOT NULL,
	"outcome" text NOT NULL,
	"detail" text,
	"quote_id" integer,
	"price_raw" text,
	"token_symbol" text,
	"signed" boolean,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tender_quote_tender_idx" ON "tender_quote" ("tender_id");
