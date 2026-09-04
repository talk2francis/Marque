ALTER TABLE "probe" ADD COLUMN "liveness" text;--> statement-breakpoint
ALTER TABLE "probe" ADD COLUMN "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "probe" ADD COLUMN "executable_endpoint" text;