import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    venueId: text('venue_id').notNull(),
    catalogVersion: text('catalog_version').notNull(),
    stage: text('stage').notNull(),
    parkingId: text('parking_id'),
    excludedParkingIds: text('excluded_parking_ids').notNull(),
    meetingPointId: text('meeting_point_id').notNull(),
    revision: integer('revision').notNull(),
    dataMode: text('data_mode').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    ownerTokenHash: text('owner_token_hash').notNull(),
    shareTokenHash: text('share_token_hash').notNull(),
    ownerTokenCipher: text('owner_token_cipher').notNull(),
    shareTokenCipher: text('share_token_cipher').notNull(),
  },
  (table) => [
    uniqueIndex('sessions_owner_token_hash_unique').on(table.ownerTokenHash),
    uniqueIndex('sessions_share_token_hash_unique').on(table.shareTokenHash),
  ],
);

export const handoffTokens = pgTable(
  'handoff_tokens',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    tokenCipher: text('token_cipher').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('handoff_tokens_token_hash_unique').on(table.tokenHash)],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: text('id').primaryKey(),
    scope: text('scope').notNull(),
    ownerHash: text('owner_hash').notNull(),
    endpoint: text('endpoint').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    bodyHash: text('body_hash').notNull(),
    httpStatus: integer('http_status').notNull(),
    responseCipher: text('response_cipher').notNull(),
    sessionId: text('session_id'),
    expiresAt: text('expires_at').notNull(),
    tombstone: integer('tombstone').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idempotency_owner_endpoint_key').on(table.ownerHash, table.endpoint, table.idempotencyKey),
  ],
);

export type SessionRecord = typeof sessions.$inferSelect;
export type HandoffTokenRecord = typeof handoffTokens.$inferSelect;
export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect;
