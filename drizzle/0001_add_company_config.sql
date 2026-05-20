CREATE TABLE "google_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"reviewer_name" text,
	"rating" integer NOT NULL,
	"review_text" text,
	"review_reply" text,
	"location_name" text NOT NULL,
	"location_id" text NOT NULL,
	"account_id" text NOT NULL,
	"review_date" timestamp NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_reviews_review_id_unique" UNIQUE("review_id")
);
--> statement-breakpoint
CREATE TABLE "google_reviews_sync_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_sync_at" timestamp NOT NULL,
	"total_reviews_synced" integer NOT NULL,
	"sync_status" text NOT NULL,
	"error_message" text,
	"location_stats" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technician_period" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_code" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"employee_id" bigint NOT NULL,
	"employee_name" text NOT NULL,
	"completed_jobs" integer DEFAULT 0 NOT NULL,
	"completed_revenue_cents" bigint DEFAULT 0 NOT NULL,
	"opportunity" integer DEFAULT 0 NOT NULL,
	"sales_opportunity" integer DEFAULT 0 NOT NULL,
	"closed_opportunities" integer DEFAULT 0 NOT NULL,
	"close_rate_bps" integer,
	"total_sales_cents" bigint DEFAULT 0 NOT NULL,
	"total_job_average_cents" bigint DEFAULT 0 NOT NULL,
	"options_per_opportunity_x100" integer,
	"memberships_sold" integer DEFAULT 0 NOT NULL,
	"leads_set" integer DEFAULT 0 NOT NULL,
	"total_lead_sales_cents" bigint DEFAULT 0 NOT NULL,
	"technician_business_unit" text,
	"technician_trade" text,
	"source_report_id" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_config" (
	"config_key" text PRIMARY KEY NOT NULL,
	"config_value" text,
	"config_type" text DEFAULT 'string' NOT NULL,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "google_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"account_id" text NOT NULL,
	"location_id" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_locations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "job_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_unit_id" integer,
	"servicetitan_id" text,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "job_types_servicetitan_id_unique" UNIQUE("servicetitan_id")
);
--> statement-breakpoint
CREATE TABLE "setup_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"step" integer NOT NULL,
	"step_name" text NOT NULL,
	"status" text NOT NULL,
	"details" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "has_technicians" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "has_comfort_advisors" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "service_titan_id" integer;--> statement-breakpoint
ALTER TABLE "call_center_daily" ADD COLUMN "avg_call_time_sec" integer;--> statement-breakpoint
ALTER TABLE "estimate_analysis" ADD COLUMN "job_id" bigint;--> statement-breakpoint
ALTER TABLE "estimate_analysis" ADD COLUMN "opportunity_status_raw" text;--> statement-breakpoint
ALTER TABLE "financial_daily" ADD COLUMN "closed_opportunities" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_types" ADD CONSTRAINT "job_types_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_reviews_loc_idx" ON "google_reviews" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "google_reviews_date_idx" ON "google_reviews" USING btree ("review_date");--> statement-breakpoint
CREATE UNIQUE INDEX "tech_period_uniq" ON "technician_period" USING btree ("role_code","period_start","period_end","employee_id");--> statement-breakpoint
CREATE INDEX "tech_period_role_idx" ON "technician_period" USING btree ("role_code");--> statement-breakpoint
CREATE INDEX "tech_period_period_idx" ON "technician_period" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "ea_job_idx" ON "estimate_analysis" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_service_titan_id_unique" UNIQUE("service_titan_id");--> statement-breakpoint
-- Pre-seed company_config keys with empty values + correct types.
-- The wizard expects to read every key on mount and write back as the
-- user fills the form. Names mirror the env-var conventions (st_*, google_*)
-- for grep-parity with the older hardcoded credentials.
INSERT INTO "company_config" ("config_key", "config_value", "config_type", "is_sensitive") VALUES
  ('company_name',          NULL,              'string',  false),
  ('company_logo_url',      NULL,              'string',  false),
  ('timezone',              'America/Chicago', 'string',  false),
  ('st_tenant_id',          NULL,              'string',  true),
  ('st_client_id',          NULL,              'string',  true),
  ('st_client_secret',      NULL,              'string',  true),
  ('st_app_key',            NULL,              'string',  true),
  ('google_client_id',      NULL,              'string',  true),
  ('google_client_secret',  NULL,              'string',  true),
  ('google_refresh_token',  NULL,              'string',  true),
  ('setup_completed',       'false',           'boolean', false),
  ('setup_step',            '1',               'number',  false)
ON CONFLICT ("config_key") DO NOTHING;