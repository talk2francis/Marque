CREATE TABLE "probe_schedule" (
	"service_id" integer PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_liveness" text,
	"consecutive_dead" integer DEFAULT 0 NOT NULL,
	"next_due_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "probe_schedule_due_idx" ON "probe_schedule" USING btree ("next_due_at");--> statement-breakpoint
CREATE INDEX "probe_schedule_agent_idx" ON "probe_schedule" USING btree ("agent_id");