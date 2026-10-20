SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
ALTER TABLE "agent_service" ADD COLUMN "currently_declared" boolean;
--> statement-breakpoint
ALTER TABLE "agent_service" ADD COLUMN "declaration_checked_at" timestamp with time zone;
