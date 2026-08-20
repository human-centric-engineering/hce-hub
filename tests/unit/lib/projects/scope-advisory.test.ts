/**
 * Unit: `scopeBreadthWarnings` (§33-sweep t-118) — the authoring-time advisory
 * for a `filesScope` entry too broad to be a signal.
 *
 * Load-bearing: it must cost **nothing** on the common write (no broad entry ⇒ no
 * query at all), load the corpus **once** for a batch, attribute each warning to
 * its task, and never reject anything — the caller has already written the row.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: { task: { findMany: vi.fn() } } }));

const { prisma } = await import('@/lib/db/client');
const { scopeBreadthWarnings } = await import('@/lib/projects/scope-advisory');

const findMany = prisma.task.findMany as ReturnType<typeof vi.fn>;

/** A project corpus: `n` tasks under `lib/`, plus one under `app/`. */
const corpus = (n: number) => [
  ...Array.from({ length: n }, (_, i) => ({ filesScope: [`lib/projects/f${i}.ts`] })),
  { filesScope: ['app/layout.tsx'] },
];

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue(corpus(3));
});

describe('scopeBreadthWarnings', () => {
  it('costs no query when every entry is specific enough', async () => {
    // The overwhelmingly common write. If this ever regresses, every create_task
    // and update_task starts paying for a project-wide scan it cannot use.
    const out = await scopeBreadthWarnings('p1', [
      { taskRef: null, filesScope: ['lib/projects/collision.ts', 'components/hub/projects/**'] },
    ]);
    expect(out).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('costs no query for an empty scope', async () => {
    expect(await scopeBreadthWarnings('p1', [{ taskRef: null, filesScope: [] }])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('counts what the broad entry would actually collide with', async () => {
    const [warning] = await scopeBreadthWarnings('p1', [{ taskRef: null, filesScope: ['lib/**'] }]);
    // 3 of the 4 scoped tasks are under lib/; the app/ one is not.
    expect(warning).toMatchObject({ entry: 'lib/**', overlaps: 3, scopedTasks: 4, taskRef: null });
    // The number is the argument — it has to reach the message, not just the object.
    expect(warning.message).toContain('3');
    expect(warning.message).toContain('4');
  });

  it('scopes the corpus to the project and honours the exclusions', async () => {
    await scopeBreadthWarnings('p1', [{ taskRef: null, filesScope: ['app/**'] }], {
      excludeTaskIds: ['t-new'],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        feature: { projectId: 'p1' },
        filesScope: { isEmpty: false },
        id: { notIn: ['t-new'] },
      },
      select: { filesScope: true },
    });
  });

  it('omits the exclusion filter entirely when there is nothing to exclude', async () => {
    await scopeBreadthWarnings('p1', [{ taskRef: null, filesScope: ['app/**'] }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { feature: { projectId: 'p1' }, filesScope: { isEmpty: false } },
      select: { filesScope: true },
    });
  });

  it('reports a repeated entry once — the same mistake twice is one mistake', async () => {
    const out = await scopeBreadthWarnings('p1', [
      { taskRef: null, filesScope: ['app/**', 'app/', 'app'] },
    ]);
    // All three normalise to `app`, but they are distinct strings: dedupe is by
    // the entry as authored, so this is three warnings unless the author wrote
    // the identical string twice.
    expect(out.map((w) => w.entry)).toEqual(['app/**', 'app/', 'app']);
    const dupes = await scopeBreadthWarnings('p1', [
      { taskRef: null, filesScope: ['app/**', 'app/**'] },
    ]);
    expect(dupes).toHaveLength(1);
  });

  it('loads the corpus ONCE for a batch and names the task each warning belongs to', async () => {
    // `plan_feature` writes a whole feature's worth at a time; the corpus is
    // identical for every one of them, and an unattributed list is unreadable.
    const out = await scopeBreadthWarnings('p1', [
      { taskRef: 't-11', filesScope: ['app/**'] },
      { taskRef: 't-12', filesScope: ['lib/projects/plan.ts'] },
      { taskRef: 't-13', filesScope: ['tests'] },
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(out.map((w) => [w.taskRef, w.entry])).toEqual([
      ['t-11', 'app/**'],
      ['t-13', 'tests'],
    ]);
  });

  it('says the scope was still saved — it advises, it does not reject', async () => {
    const [warning] = await scopeBreadthWarnings('p1', [{ taskRef: null, filesScope: ['app'] }]);
    expect(warning.message).toMatch(/advisory/i);
    expect(warning.message).toContain('saved as written');
  });
});
