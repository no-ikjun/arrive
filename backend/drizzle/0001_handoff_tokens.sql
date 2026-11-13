CREATE TABLE "handoff_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "token_cipher" text NOT NULL,
  "expires_at" text NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "handoff_tokens_token_hash_unique" ON "handoff_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX "handoff_tokens_session" ON "handoff_tokens" ("session_id");
--> statement-breakpoint
CREATE INDEX "handoff_tokens_expires_at" ON "handoff_tokens" ("expires_at");
