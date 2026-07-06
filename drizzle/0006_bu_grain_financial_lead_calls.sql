-- 0006: BU-grain financial_daily + lead-call columns + daily-targets support
--
-- financial_daily moves from (department_code, report_date) grain to
-- (business_unit_id, report_date). department_code stays denormalized so
-- dept-level rollups keep working without a join. Existing dept-grain rows
-- have NULL business_unit_id; clear fact data before the first BU-grain
-- sync (fresh installs are unaffected).

ALTER TABLE "financial_daily" ADD COLUMN IF NOT EXISTS "business_unit_id" integer;

DROP INDEX IF EXISTS "fin_daily_uniq";
CREATE UNIQUE INDEX IF NOT EXISTS "fin_daily_uniq" ON "financial_daily" ("business_unit_id", "report_date");
CREATE INDEX IF NOT EXISTS "fin_daily_dept_date_idx" ON "financial_daily" ("department_code", "report_date");

-- Call center: lead-vs-not-lead classification counters
ALTER TABLE "call_center_daily" ADD COLUMN IF NOT EXISTS "lead_calls" integer NOT NULL DEFAULT 0;
ALTER TABLE "call_center_daily" ADD COLUMN IF NOT EXISTS "lead_calls_booked" integer NOT NULL DEFAULT 0;
