ALTER TABLE "probe" ADD COLUMN "protocol_version" text;
ALTER TABLE "probe" ADD COLUMN "task_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "probe" ADD COLUMN "manifest" jsonb;

ALTER TABLE "run" ADD COLUMN "service_id" integer;
ALTER TABLE "run" ADD COLUMN "protocol" text;
ALTER TABLE "run" ADD COLUMN "discovery_endpoint" text;
ALTER TABLE "run" ADD COLUMN "executable_endpoint" text;
ALTER TABLE "run" ADD COLUMN "probe_id" integer;
ALTER TABLE "run" ADD COLUMN "capability" text;
ALTER TABLE "run" ADD COLUMN "input_hash" text;
ALTER TABLE "run" ADD COLUMN "correlation_id" text;
ALTER TABLE "run" ADD COLUMN "terminal_reason" text;
ALTER TABLE "run" ADD COLUMN "quote" jsonb;

ALTER TABLE "receipt" ADD COLUMN "artifact_type" text DEFAULT 'execution' NOT NULL;

CREATE INDEX "probe_service_checked_idx" ON "probe" USING btree ("service_id", "checked_at" DESC NULLS LAST);
CREATE INDEX "run_service_idx" ON "run" USING btree ("service_id", "started_at" DESC NULLS LAST);
CREATE INDEX "run_correlation_idx" ON "run" USING btree ("correlation_id");
