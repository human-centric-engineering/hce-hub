/**
 * Unit: project-admin Zod schemas (f-project-admin).
 * Imports the specific module (not a barrel) so no DB client is dragged in.
 */
import { describe, it, expect } from 'vitest';
import {
  createProjectSchema,
  updateProjectSchema,
  addMemberSchema,
} from '@/lib/validations/project-admin';

describe('createProjectSchema', () => {
  const base = { name: 'Hub', hostPlatform: 'sunrise', leadUserId: 'user_1' };

  it('accepts a valid project with a supported platform', () => {
    expect(createProjectSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a stubbed platform slug', () => {
    expect(createProjectSchema.safeParse({ ...base, hostPlatform: 'laravel-forge' }).success).toBe(
      true
    );
  });

  it('rejects an unknown host platform', () => {
    expect(createProjectSchema.safeParse({ ...base, hostPlatform: 'wordpress' }).success).toBe(
      false
    );
  });

  it('rejects an empty name and a missing lead', () => {
    expect(createProjectSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: 'X', hostPlatform: 'sunrise' }).success).toBe(
      false
    );
  });

  it('rejects a non-URL repo entry', () => {
    expect(createProjectSchema.safeParse({ ...base, repoUrls: ['not a url'] }).success).toBe(false);
    expect(
      createProjectSchema.safeParse({ ...base, repoUrls: ['https://github.com/x/y'] }).success
    ).toBe(true);
  });
});

describe('updateProjectSchema', () => {
  it('accepts a partial update', () => {
    expect(updateProjectSchema.safeParse({ status: 'active' }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ leadUserId: 'user_2' }).success).toBe(true);
  });

  it('rejects an empty patch (no fields to update)', () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an invalid status', () => {
    expect(updateProjectSchema.safeParse({ status: 'done' }).success).toBe(false);
  });
});

describe('addMemberSchema', () => {
  it('requires a userId', () => {
    expect(addMemberSchema.safeParse({ userId: 'user_9' }).success).toBe(true);
    expect(addMemberSchema.safeParse({}).success).toBe(false);
  });
});
