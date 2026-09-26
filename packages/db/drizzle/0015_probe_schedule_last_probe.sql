ALTER TABLE "probe_schedule" ADD COLUMN "last_probe_id" integer;--> statement-breakpoint
UPDATE "probe_schedule" ps SET "last_probe_id" = (
  SELECT p."id" FROM "probe" p WHERE p."service_id" = ps."service_id" ORDER BY p."checked_at" DESC LIMIT 1
) WHERE ps."last_probe_id" IS NULL AND ps."last_checked_at" IS NOT NULL;
