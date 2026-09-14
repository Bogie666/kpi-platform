import { getConfigTyped } from '@/lib/config-service';
import { classifyBuName, type SourceClass } from '@/lib/kpi/source-class';

interface BusinessUnitIdentity {
  id: number;
  name: string;
}

const VALID_CLASSES = new Set<SourceClass>(['demand', 'maintenance', 'install']);

function configuredClass(
  raw: Record<string, unknown> | null,
  bu: BusinessUnitIdentity,
): SourceClass | null {
  if (!raw) return null;
  const value = raw[String(bu.id)] ?? raw[bu.name] ?? raw[bu.name.toLowerCase()];
  return typeof value === 'string' && VALID_CLASSES.has(value as SourceClass)
    ? (value as SourceClass)
    : null;
}

/**
 * Build the tenant's BU-to-source-class map for capacity planning.
 *
 * Optional company_config key (JSON): `business_unit_source_classes`.
 * Keys may be ServiceTitan BU IDs or exact BU names; values are `demand`,
 * `maintenance`, or `install`. Name-based classification remains the fallback
 * so existing tenants require no migration, while new tenants can override
 * every ambiguous business unit without code changes.
 */
export async function loadBuSourceClasses(
  businessUnits: readonly BusinessUnitIdentity[],
): Promise<Map<number, SourceClass>> {
  const value = await getConfigTyped<unknown>('business_unit_source_classes');
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

  return new Map(
    businessUnits.map((bu) => [bu.id, configuredClass(raw, bu) ?? classifyBuName(bu.name)]),
  );
}
