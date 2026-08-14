/**
 * The published JSON Schema must tell the truth about the Zod schema behind it
 * (f-authoring-fidelity §21 t-91).
 *
 * Every Hub capability carries two descriptions of the same contract: the Zod
 * `schema` that actually validates a call, and the `functionDefinition.parameters`
 * JSON Schema handed to the LLM — over MCP it becomes the tool's `inputSchema`
 * verbatim (`lib/orchestration/mcp/tool-registry.ts`). When they disagree, the
 * agent is working from a lie: it will not send an argument the published schema
 * forbids, however clearly the *prose* invites it.
 *
 * Not hypothetical. Twelve parameters documented "null clears it" while publishing
 * a bare `"type": "string"`, so `null` was unreachable over MCP —
 * `update_feature { ownerUserId: null }` is the unclaim path, which meant a feature
 * could not be unclaimed from the Hub at all. Found on prod, not by inspection.
 *
 * Driven off `initAppCapabilities()` rather than a hand-list, so a capability added
 * later is covered without anyone remembering to come back here — and off the
 * *registration seam* specifically, so what's checked is what's actually served.
 *
 * Nullability is probed with `safeParse(null)` rather than by reading Zod
 * internals: it asks the question the caller actually asks ("will this accept a
 * null?") and survives a Zod major.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';

/**
 * A registered capability, with its Zod `schema` surfaced. Composed by `Pick`
 * rather than by extending `BaseCapability`: `schema` is `protected` there, and an
 * interface can only re-declare it from a derived class.
 */
type Introspected = Pick<BaseCapability, 'slug' | 'functionDefinition'> & {
  schema: { shape: Record<string, { safeParse: (v: unknown) => { success: boolean } }> };
};

// Collect every capability the app registers, by standing in for the registry.
// `vi.hoisted` because a `vi.mock` factory is lifted above normal declarations.
const registered = vi.hoisted(() => [] as unknown[]);
vi.mock('@/lib/orchestration/capabilities/registry', () => ({
  registerAppCapability: (capability: unknown) => {
    registered.push(capability);
  },
}));

const { initAppCapabilities } = await import('@/lib/app/capabilities');
initAppCapabilities();
const capabilities = registered as Introspected[];

/** Does a published property permit a JSON `null`? Encoding-agnostic on purpose. */
function publishesNull(property: unknown): boolean {
  if (!property || typeof property !== 'object') return false;
  const p = property as { type?: unknown; anyOf?: unknown; oneOf?: unknown };
  if (p.type === 'null') return true;
  if (Array.isArray(p.type) && p.type.includes('null')) return true;
  return [p.anyOf, p.oneOf].some(
    (branches) => Array.isArray(branches) && branches.some((b) => publishesNull(b))
  );
}

/** The `properties` map of a capability's published parameter schema. */
function publishedProperties(cap: Introspected): Record<string, unknown> {
  const params = cap.functionDefinition.parameters as { properties?: unknown };
  return params.properties && typeof params.properties === 'object'
    ? (params.properties as Record<string, unknown>)
    : {};
}

describe('capability published-schema parity', () => {
  it('collected the registered Hub capabilities (guards the harness itself)', () => {
    // A harness that silently collected nothing would make every case below vacuous.
    expect(capabilities.length).toBeGreaterThan(20);
    expect(capabilities.map((c) => c.slug)).toContain('update_feature');
  });

  it('publishes null for exactly the parameters whose Zod accepts null', () => {
    const mismatches: string[] = [];

    for (const cap of capabilities) {
      const properties = publishedProperties(cap);
      for (const [field, validator] of Object.entries(cap.schema.shape)) {
        const zodAcceptsNull = validator.safeParse(null).success;
        const published = publishesNull(properties[field]);
        if (zodAcceptsNull !== published) {
          mismatches.push(
            `${cap.slug}.${field}: Zod ${zodAcceptsNull ? 'accepts' : 'rejects'} null, ` +
              `published schema ${published ? 'permits' : 'forbids'} it`
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('publishes every parameter the Zod schema accepts', () => {
    const unpublished: string[] = [];

    for (const cap of capabilities) {
      const properties = publishedProperties(cap);
      for (const field of Object.keys(cap.schema.shape)) {
        if (!(field in properties)) unpublished.push(`${cap.slug}.${field}`);
      }
    }

    // An accepted-but-unpublished parameter is invisible to the agent — the same
    // defect one layer over (a capability the write path cannot actually reach).
    expect(unpublished).toEqual([]);
  });
});
