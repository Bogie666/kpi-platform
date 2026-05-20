import { pgTable, serial, text, boolean, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { businessUnits } from './dimensions';

/**
 * company_config — key/value store backing the setup wizard.
 *
 * Holds tenant identity (company_name, logo, timezone), API credentials
 * (ST_*, GOOGLE_*), and setup-state flags (setup_completed, setup_step).
 * Reads always go through src/lib/config-service.ts so the cache stays warm.
 *
 * Key naming convention matches the env-var names used in lexkpi
 * (st_tenant_id ↔ ST_TENANT_ID, google_client_id ↔ GOOGLE_CLIENT_ID).
 */
export const companyConfig = pgTable('company_config', {
  configKey: text('config_key').primaryKey(),
  configValue: text('config_value'),
  configType: text('config_type').notNull().default('string'), // 'string' | 'number' | 'boolean' | 'json'
  isSensitive: boolean('is_sensitive').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: text('updated_by'),
});

/**
 * google_locations — replaces the hardcoded LOCATIONS array in
 * src/lib/sync/google/business.ts. `slug` is the friendly identifier
 * surfaced as RawReview.locationId (e.g. 'lex', 'lyons').
 */
export const googleLocations = pgTable('google_locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  accountId: text('account_id').notNull(),
  locationId: text('location_id').notNull(),
  slug: text('slug').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** setup_log — audit trail for every wizard step transition. */
export const setupLog = pgTable('setup_log', {
  id: serial('id').primaryKey(),
  step: integer('step').notNull(),
  stepName: text('step_name').notNull(),
  status: text('status').notNull(), // 'started' | 'completed' | 'failed' | 'skipped'
  details: jsonb('details'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * job_types — scaffolding for a future "ST job-type → division" UI.
 * Schema only in v1; no read path uses it yet.
 */
export const jobTypes = pgTable('job_types', {
  id: serial('id').primaryKey(),
  businessUnitId: integer('business_unit_id').references(() => businessUnits.id),
  servicetitanId: text('servicetitan_id').unique(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});
