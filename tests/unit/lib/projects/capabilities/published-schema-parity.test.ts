/**
 * The published JSON Schema must tell the truth about the Zod schema behind it
 * (f-authoring-fidelity §21 t-91).
 *
 * Every Hub capability carries two descriptions of the same contract: the Zod
 * `schema` that actually validates a call, and the `functionDefinition.parameters`
 * JSON Schema that is handed to the LLM — over MCP it becomes the tool's
 * `inputSchema` verbatim (`lib/orchestration/mcp/tool-registry.ts`). When they
 * disagree, the agent is working from a lie: it will not send an argument the
 * published schema forbids, however clearly the *prose* invites it.
 *
 * That is not hypothetical. Ten parameters documented "null clears it" while
 * publishing a bare `"type": "string"`, so `null` was unreachable over MCP —
 * `update_feature { ownerUserId: null }` is the unclaim path, which meant a
 * feature could not be unclaimed from the Hub at all. Found on prod, not by
 * inspection.
 *
 * This walks the capability folder rather than a hand-list, so a capability added
 * later is covered without anyone remembering to add it here — the same reason
 * the seed↔class parity tests exist.
 *
 * Nullability is probed by `safeParse(null)` rather than by reading Zod internals:
 * it asks the question the caller actually asks ("will this accept a null?") and
 * survives a Zod major.
 */
import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';

/** A capability class as constructed here — no-arg, with its protected Zod schema read. */
type CapabilityInstance = BaseCapability & { schema: z.ZodObject<z.ZodRawShape> };

/**
 * Every capability module in the Hub's own folder. Root-absolute so the glob
 * carries no relative path (`@/` isn't resolvable inside `import.meta.glob`).
 */
const modules = import.meta.glob<Record<string, unknown>>('/lib/projects/capabilities/*.ts');

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
function publishedProperties(cap: BaseCapability): Record<string, unknown> {
  const params = cap.functionDefinition.parameters as { properties?: unknown };
  return params.properties && typeof params.properties === 'object'
    ? (params.properties as Record<string, unknown>)
    : {};
}

/** Instantiate every exported `*Capability` class found in the folder. */
async function loadCapabilities(): Promise<CapabilityInstance[]> {
  const instances: CapabilityInstance[] = [];
  for (const load of Object.values(modules)) {
    const mod = await load();
    for (const [name, exported] of Object.entries(mod)) {
      if (!name.endsWith('Capability') || typeof exported !== 'function') continue;
      const Ctor = exported as new () => CapabilityInstance;
      instances.push(new Ctor());
    }
  }
  return instances;
}

describe('capability published-schema parity', () => {
  it('finds the Hub capability classes (guards the glob itself)', async () => {
    const caps = await loadCapabilities();
    // A glob that silently resolves to nothing would make every case below vacuous.
    expect(caps.length).toBeGreaterThan(20);
    expect(caps.map((c) => c.slug)).toContain('update_feature');
  });

  it('publishes null for exactly the parameters whose Zod accepts null', async () => {
    const caps = await loadCapabilities();
    const mismatches: string[] = [];

    for (const cap of caps) {
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

  it('publishes every parameter the Zod schema accepts', async () => {
    const caps = await loadCapabilities();
    const unpublished: string[] = [];

    for (const cap of caps) {
      const properties = publishedProperties(cap);
      for (const field of Object.keys(cap.schema.shape)) {
        if (!(field in properties)) unpublished.push(`${cap.slug}.${field}`);
      }
    }

    // An accepted-but-unpublished parameter is invisible to the agent — the same
    // defect one layer over (a capability the write path can't actually reach).
    expect(unpublished).toEqual([]);
  });
});
