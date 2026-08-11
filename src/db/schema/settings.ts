/**
 * app_settings — small key/value store for operational knobs that don't fit
 * the targets model (e.g. working-day hours for intraday pacing). One row
 * per setting key, JSON payload, edited from the admin section.
 */
import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
