CREATE TABLE "run_rejection" (
	"id" text PRIMARY KEY NOT NULL,
	"charter_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"service_id" integer,
	"protocol" text,
	"task_kind" text NOT NULL,
	"subject" text NOT NULL,
	"reason" text NOT NULL,
	"detail" text NOT NULL,
	"rejected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "run_rejection_charter_idx" ON "run_rejection" USING btree ("charter_id","rejected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "run_rejection_agent_idx" ON "run_rejection" USING btree ("agent_id","rejected_at" DESC NULLS LAST);
