/**
 * Generic KPI cache — memoizes expensive live-computed metrics (ones that
 * crawl ServiceTitan on each request) so the dashboard reads are instant.
 */
import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const kpiCache = pgTable('kpi_cache', {
  cacheKey: text('cache_key').primaryKey(),
  payload: jsonb('payload').notNull(),
  computedAt: timestamp('computed_at').defaultNow().notNull(),
});
