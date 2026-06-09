CREATE TABLE IF NOT EXISTS "kpi_cache" (
  "cache_key" text PRIMARY KEY NOT NULL,
  "payload" jsonb NOT NULL,
  "computed_at" timestamp DEFAULT now() NOT NULL
);
