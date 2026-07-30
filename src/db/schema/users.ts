/**
 * Dashboard users — internal logins.
 *
 * Stored separately from `employees` (which mirrors ServiceTitan's tech
 * roster) because not every dashboard user is a ST tech, and dashboard
 * auth shouldn't depend on the sync. Email is the login identifier;
 * password_hash is bcrypt (bcryptjs).
 *
 * Admin status is NOT stored here. The admin allowlist lives in the
 * ADMIN_EMAILS env var so we can adjust without DB migrations and
 * without exposing role-management surface area to non-admins.
 */
import { pgTable, serial, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  /** Lowercased + trimmed on insert; index relies on canonical form. */
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
});
