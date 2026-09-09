-- Append-only provenance corrections for benchmark runs (P8b Agent Advantage
-- repair). See packages/db/src/schema.ts. `product_event` is intentionally NOT
-- re-created here: it was added by the hand-written 0010_product_event.sql and
-- already exists in every environment; drizzle-kit re-emits it only because
-- 0010 shipped without a meta snapshot.

CREATE TABLE "benchmark_run_provenance" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"field" text NOT NULL,
	"original_value" text,
	"effective_value" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason" text NOT NULL,
	"source_task_hash" text,
	"source_evidence_url" text,
	"repair_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benchmark_run_provenance" ADD CONSTRAINT "benchmark_run_provenance_run_id_benchmark_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "benchmark_run_provenance_run_field_idx" ON "benchmark_run_provenance" USING btree ("run_id","field");
