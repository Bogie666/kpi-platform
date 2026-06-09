DROP INDEX IF EXISTS "tech_period_uniq";
CREATE UNIQUE INDEX IF NOT EXISTS "tech_period_uniq" ON "technician_period" (
  "role_code",
  "period_start",
  "period_end",
  "employee_id",
  "source_report_id"
);
