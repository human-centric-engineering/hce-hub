/**
 * Class ↔ seed parity for **every** Hub capability, derived rather than listed
 * (f-hub-capabilities t-124).
 *
 * Each Hub verb exists twice: the **class** that validates and runs a call, and the
 * **seeded row** the MCP tool list is served from. The row is what every agent is
 * *shown*; the class is what actually happens. When they disagree the agent works
 * from a lie — offered a parameter the handler rejects, or never told about one it
 * could have used (Sunrise #545: `call_external_api`'s class grew a `multipart`
 * parameter its seed never gained, so no agent could ever use it).
 *
 * **Why this file exists rather than another hand-written table.** The platform's
 * `capability-class-seed-parity` has a completeness check meant to make that
 * impossible to forget — but its scanner reads `functionDefinition` only where it is
 * an **inline object literal** in the upsert, and every Hub seed spreads a hoisted
 * `*_IMPL` const instead. Measured 2026-08-21: `definedNames` returns 10 names, all
 * platform; all 29 Hub capabilities are invisible to it. So Hub parity lived in
 * hand-written tables that nothing checked were complete — "somebody remembered",
 * behind a test that looked like it enforced it. Filed upstream as sunrise#646.
 *
 * Nothing here is listed. Both sides are discovered:
 *
 *  - **classes** by standing in for the registry and calling `initAppCapabilities()`
 *    — the registration seam, so what is checked is what is actually served
 *    (`published-schema-parity.test.ts`'s technique);
 *  - **seeds** by reading the seed directory and *executing* each unit against a
 *    mock context, so what is compared is what the upsert really writes, not what a
 *    module happens to export (`capability-sync.test.ts`'s technique).
 *
 * Add a capability and forget its seed, its registration, or keep the two out of
 * step, and this fails without anyone remembering to come back here.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, it, expect, vi } from 'vitest';

import type { SeedContext, SeedUnit } from '@/prisma/runner';
import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';

const SEED_DIR = join(process.cwd(), 'prisma', 'seeds', 'app');

// ── Side A: the classes, via the registration seam ────────────────────────────
// `vi.hoisted` because a `vi.mock` factory is lifted above normal declarations.
const registered = vi.hoisted(() => [] as unknown[]);
vi.mock('@/lib/orchestration/capabilities/registry', () => ({
  registerAppCapability: (capability: unknown) => {
    registered.push(capability);
  },
}));

const { initAppCapabilities } = await import('@/lib/app/capabilities');
initAppCapabilities();
const classes = registered as Pick<BaseCapability, 'slug' | 'functionDefinition'>[];

// ── Side B: the seeds, by running them ────────────────────────────────────────
/**
 * Only the seeds that actually upsert a capability. Decided from the file's source
 * rather than by running everything: `006-sample-plan` and friends touch models this
 * narrow mock does not carry, and a permissive mock that let them run would be
 * guessing at return shapes. The filter is one string, and the count assertion below
 * is what stops it silently matching nothing.
 */
function capabilitySeedFiles(): string[] {
  return readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => readFileSync(join(SEED_DIR, f), 'utf8').includes('aiCapability.upsert'))
    .sort();
}

interface SeededCapability {
  file: string;
  slug: string;
  /** What the UPDATE branch writes — the copy #545 made re-apply to existing rows. */
  functionDefinition: unknown;
}

async function runSeed(file: string): Promise<SeededCapability[]> {
  const mod = (await import(pathToFileURL(join(SEED_DIR, file)).href)) as { default?: SeedUnit };
  const unit = mod.default;
  if (!unit) throw new Error(`${file} has no default export`);

  const upsert = vi.fn().mockResolvedValue({ id: 'cap-1' });
  const mcpUpsert = vi.fn().mockResolvedValue({ id: 'tool-1' });
  const ctx = {
    prisma: { aiCapability: { upsert }, mcpExposedTool: { upsert: mcpUpsert } },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as unknown as SeedContext;

  await unit.run(ctx);

  return upsert.mock.calls.map(([arg]) => {
    const a = arg as { where?: { slug?: string }; update?: { functionDefinition?: unknown } };
    return {
      file,
      slug: a.where?.slug ?? '(no literal slug)',
      functionDefinition: a.update?.functionDefinition,
    };
  });
}

const seeded = (await Promise.all(capabilitySeedFiles().map(runSeed))).flat();
const seededBySlug = new Map(seeded.map((s) => [s.slug, s]));
const classBySlug = new Map(classes.map((c) => [c.slug, c]));

describe('the harness itself', () => {
  // Every assertion below is a set comparison, and a set comparison over nothing
  // passes. `capability-class-seed-parity` learned this the hard way: an earlier
  // version read zero slugs through a regex bug, so `[].filter(unpaired)` was `[]`
  // and it reported success while covering nothing.
  it('discovered capabilities on both sides', () => {
    expect(classes.length).toBeGreaterThan(20);
    expect(seeded.length).toBeGreaterThan(20);
  });

  it('found a slug for every seeded capability', () => {
    // A seed whose `where` is computed rather than literal would silently become
    // "(no literal slug)" and pair with nothing.
    expect(seeded.filter((s) => s.slug === '(no literal slug)')).toEqual([]);
  });

  it('has no duplicate slugs on either side', () => {
    expect(seededBySlug.size).toBe(seeded.length);
    expect(classBySlug.size).toBe(classes.length);
  });
});

describe('every registered capability has a seed, and vice versa', () => {
  it('no registered class is missing its seed row', () => {
    // A class registered without a seed dispatches to `capability_inactive` at
    // runtime — registering it is necessary, not sufficient.
    expect([...classBySlug.keys()].filter((slug) => !seededBySlug.has(slug))).toEqual([]);
  });

  it('no seeded capability is missing its class', () => {
    // The mirror: a row the MCP tool list advertises with nothing behind it.
    expect([...seededBySlug.keys()].filter((slug) => !classBySlug.has(slug))).toEqual([]);
  });
});

describe('class functionDefinition equals the seeded copy', () => {
  it.each([...classBySlug.keys()].sort())('%s', (slug) => {
    // Deep equality on purpose. Comparing parameter NAMES would have caught #545's
    // missing `multipart` but not the `body` description that had drifted with it —
    // and a description is not cosmetic, it is how the model picks a parameter.
    expect(seededBySlug.get(slug)!.functionDefinition).toEqual(
      classBySlug.get(slug)!.functionDefinition
    );
  });

  it('the seeded name matches the slug it is keyed on', () => {
    const mismatched = seeded
      .filter((s) => (s.functionDefinition as { name?: string })?.name !== s.slug)
      .map(
        (s) =>
          `${s.file}: slug '${s.slug}' vs name '${(s.functionDefinition as { name?: string })?.name}'`
      );
    expect(mismatched).toEqual([]);
  });
});
