SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- Optional owner-signed presentation. No existing identity, observation or portrait is changed.
-- A null image restores the default header and retains the presentation row and proof.
CREATE TABLE IF NOT EXISTS "agent_banner" (
  "agent_id" text PRIMARY KEY NOT NULL,
  "image_id" text REFERENCES "profile_image" ("id"),
  "owner" text NOT NULL,
  "proof_message" text NOT NULL,
  "proof_signature" text NOT NULL,
  "set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_banner_image_idx" ON "agent_banner" ("image_id") WHERE "image_id" IS NOT NULL;
