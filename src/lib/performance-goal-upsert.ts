import { sql } from 'drizzle-orm';
import type { GoalInput } from './performance-goals';

/** Run AFTER LOCK TABLE targets IN SHARE ROW EXCLUSIVE MODE in the same
 * Neon HTTP batch transaction. A separate lock statement is intentional:
 * the following statement then takes a fresh READ COMMITTED snapshot after
 * waiting for any previous editor, preventing simultaneous overlapping saves.
 */
export function performanceGoalUpsertSql(body: GoalInput) {
  return sql`
    WITH same_scope AS MATERIALIZED (
      SELECT * FROM targets WHERE metric = ${body.metric} AND scope = ${body.scope}
        AND scope_value IS NOT DISTINCT FROM ${body.scopeValue}::text
    ), existing AS MATERIALIZED (
      SELECT id FROM targets WHERE
        CASE WHEN ${body.id ?? null}::integer IS NOT NULL THEN id = ${body.id ?? null}::integer
          AND ((scope IN ('role','employee') AND metric IN ('revenue','close_rate','avg_ticket','jobs','opportunities','memberships_sold')) OR (scope = 'company' AND metric IN ('active_memberships','new_memberships')))
        ELSE id IN (SELECT id FROM same_scope WHERE effective_from = ${body.effectiveFrom}::date
          AND effective_to = ${body.effectiveTo}::date) END
      ORDER BY updated_at DESC, id DESC LIMIT 1
    ), conflict AS MATERIALIZED (
      SELECT id FROM same_scope
      WHERE effective_from <= ${body.effectiveTo}::date AND effective_to >= ${body.effectiveFrom}::date
        AND CASE WHEN ${body.id ?? null}::integer IS NOT NULL THEN id <> ${body.id ?? null}::integer
          ELSE NOT (effective_from = ${body.effectiveFrom}::date AND effective_to = ${body.effectiveTo}::date) END
    ), updated AS (
      UPDATE targets SET metric = ${body.metric}, scope = ${body.scope}, scope_value = ${body.scopeValue},
        effective_from = ${body.effectiveFrom}::date, effective_to = ${body.effectiveTo}::date,
        target_value = ${body.targetValue}, unit = ${body.unit},
        notes = CASE WHEN ${body.notes !== undefined} THEN ${body.notes ?? null}::text ELSE notes END,
        updated_at = now()
      WHERE id IN (SELECT id FROM existing) AND NOT EXISTS (SELECT 1 FROM conflict)
      RETURNING id
    ), inserted AS (
      INSERT INTO targets (metric, scope, scope_value, effective_from, effective_to, target_value, unit, notes)
      SELECT ${body.metric}, ${body.scope}, ${body.scopeValue}, ${body.effectiveFrom}::date,
        ${body.effectiveTo}::date, ${body.targetValue}, ${body.unit}, ${body.notes ?? null}
      WHERE NOT EXISTS (SELECT 1 FROM existing) AND NOT EXISTS (SELECT 1 FROM conflict)
        AND ${body.id ?? null}::integer IS NULL
      RETURNING id
    )
    SELECT id, 'updated' AS action FROM updated
    UNION ALL SELECT id, 'inserted' AS action FROM inserted
    UNION ALL SELECT NULL::integer AS id, 'conflict' AS action WHERE EXISTS (SELECT 1 FROM conflict)
    UNION ALL SELECT NULL::integer AS id, 'not_found' AS action
      WHERE ${body.id ?? null}::integer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM existing)
        AND NOT EXISTS (SELECT 1 FROM conflict)
  `;
}
