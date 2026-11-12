CREATE TABLE "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "venue_id" text NOT NULL,
  "catalog_version" text NOT NULL,
  "stage" text NOT NULL,
  "parking_id" text,
  "excluded_parking_ids" text NOT NULL,
  "meeting_point_id" text NOT NULL,
  "revision" integer NOT NULL,
  "data_mode" text NOT NULL,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  "expires_at" text NOT NULL,
  "owner_token_hash" text NOT NULL,
  "share_token_hash" text NOT NULL,
  "owner_token_cipher" text NOT NULL,
  "share_token_cipher" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_owner_token_hash_unique" ON "sessions" ("owner_token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_share_token_hash_unique" ON "sessions" ("share_token_hash");
--> statement-breakpoint
CREATE INDEX "sessions_expires_at" ON "sessions" ("expires_at");
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
  "id" text PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "owner_hash" text NOT NULL,
  "endpoint" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "body_hash" text NOT NULL,
  "http_status" integer NOT NULL,
  "response_cipher" text NOT NULL,
  "session_id" text,
  "expires_at" text NOT NULL,
  "tombstone" integer NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_owner_endpoint_key" ON "idempotency_records" ("owner_hash", "endpoint", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "idempotency_expires_at" ON "idempotency_records" ("expires_at");
--> statement-breakpoint
CREATE INDEX "idempotency_session" ON "idempotency_records" ("session_id");
