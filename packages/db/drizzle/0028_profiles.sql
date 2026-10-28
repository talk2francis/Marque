SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- Profiles (28 Oct): opt-in, owner-signed presentation for a wallet, and owner-set portraits for agents. Nothing here
-- is read from chain or used to rank anything; an address with no row renders exactly as before. FIRST-PARTY.
-- Uploaded images are raster only (PNG, JPEG, WebP), checked by header, at most 1024 px and 1.5 MB.
CREATE TABLE IF NOT EXISTS "profile_image" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_image_owner_idx" ON "profile_image" ("owner", "created_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_profile" (
	"address" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"bio" text,
	"avatar" jsonb NOT NULL,
	"accent" text,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"public" boolean DEFAULT true NOT NULL,
	"proof_message" text NOT NULL,
	"proof_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_portrait" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"image_id" text NOT NULL REFERENCES "profile_image" ("id"),
	"owner" text NOT NULL,
	"proof_message" text NOT NULL,
	"proof_signature" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
