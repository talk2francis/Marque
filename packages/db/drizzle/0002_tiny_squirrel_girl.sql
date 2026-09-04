CREATE TABLE "conformance_result" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"test_id" text NOT NULL,
	"test_version" text NOT NULL,
	"tolerance_revision" integer NOT NULL,
	"category" text NOT NULL,
	"case_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" text NOT NULL,
	"pass" boolean NOT NULL,
	"diffs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latency_ms" integer,
	"cost_usd" double precision,
	"request" jsonb,
	"response" jsonb,
	"request_hash" text NOT NULL,
	"response_hash" text NOT NULL,
	"error" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conformance_agent_ran_idx" ON "conformance_result" USING btree ("agent_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conformance_test_ran_idx" ON "conformance_result" USING btree ("test_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conformance_pass_idx" ON "conformance_result" USING btree ("pass");