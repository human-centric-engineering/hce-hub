/**
 * Unit: project transfer snapshot schema (f-selfhost-cutover §19 t-1).
 * @see lib/projects/transfer/schema.ts
 */
import { describe, it, expect } from 'vitest';
import { projectTransferSchema, PROJECT_TRANSFER_VERSION } from '@/lib/projects/transfer/schema';

const minimal = {
  schemaVersion: 1,
  exportedAt: '2026-07-22T00:00:00.000Z',
  data: {
    project: {
      id: 'p1',
      name: 'HCE Hub',
      hostPlatform: 'sunrise',
      status: 'active',
      repoUrls: [],
      leadUserId: 'u1',
      knowledgeTagId: null,
      sidekickAgentId: null,
      taskCounter: 0,
      featureCounter: 0,
      createdAt: '2026-07-01T00:00:00.000Z',
    },
    members: [],
    features: [],
    featureDependencies: [],
    indicativeTasks: [],
    tasks: [],
    taskDependencies: [],
    taskClaims: [],
    events: [],
  },
};

describe('projectTransferSchema', () => {
  it('accepts a well-formed snapshot', () => {
    const parsed = projectTransferSchema.parse(minimal);
    expect(parsed.schemaVersion).toBe(PROJECT_TRANSFER_VERSION);
    expect(parsed.data.project.name).toBe('HCE Hub');
  });

  it('rejects an unsupported schemaVersion', () => {
    expect(() => projectTransferSchema.parse({ ...minimal, schemaVersion: 2 })).toThrow();
  });

  it('rejects an unknown enum value', () => {
    const bad = {
      ...minimal,
      data: { ...minimal.data, project: { ...minimal.data.project, status: 'live' } },
    };
    expect(() => projectTransferSchema.parse(bad)).toThrow();
  });

  it('defaults a member userHint to null when omitted', () => {
    const withMember = {
      ...minimal,
      data: {
        ...minimal.data,
        members: [{ id: 'm1', userId: 'u1', role: 'lead', addedAt: '2026-07-01T00:00:00.000Z' }],
      },
    };
    const parsed = projectTransferSchema.parse(withMember);
    expect(parsed.data.members[0].userHint).toBeNull();
  });
});
