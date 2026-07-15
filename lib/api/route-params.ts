/**
 * Route path-param validation (fork-owned helper).
 *
 * Sunrise's `lib/api/validation.ts` covers request bodies (`validateRequestBody`)
 * and query strings (`validateQueryParams`) but has **no** path-param validator,
 * so ~21 `[id]` routes across the platform each hand-roll a local
 * `parse<Entity>Id` (CUID `safeParse` → throw `ValidationError`). This fork-owned
 * helper DRYs that one operation for HCE Hub's own routes.
 *
 * Upstream candidate (fork-first): a generic `validatePathParam(raw, schema,
 * field)` belongs next to `validateQueryParams` in core `lib/api/validation.ts`
 * so those ~18 routes can DRY — proposed as sunrise#435. When it lands, delete
 * this file and switch to the core helper (tracked in the `.context/app/
 * platform-divergences.md` upstream-asks table).
 */

import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';

/**
 * Validate a dynamic route segment as a CUID, or throw `ValidationError` (→ 400).
 * `field` names the segment in the error detail (defaults to `'id'`).
 */
export function parseCuidParam(raw: string, field = 'id'): string {
  const parsed = cuidSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(`Invalid ${field}`, { [field]: ['Must be a valid CUID'] });
  }
  return parsed.data;
}
