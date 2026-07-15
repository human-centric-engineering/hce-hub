import { describe, it, expect } from 'vitest';
import { projectFormSchema } from '@/components/admin/projects/project-form-schema';

const base = {
  name: 'Hub',
  hostPlatform: 'sunrise',
  leadUserId: 'u1',
  status: 'planning' as const,
};

describe('projectFormSchema', () => {
  it('accepts a valid form', () => {
    expect(projectFormSchema.safeParse(base).success).toBe(true);
  });

  it('requires a name, a known platform, and a lead', () => {
    expect(projectFormSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
    expect(projectFormSchema.safeParse({ ...base, hostPlatform: 'nope' }).success).toBe(false);
    expect(projectFormSchema.safeParse({ ...base, leadUserId: '' }).success).toBe(false);
  });

  it('accepts a blank/omitted repo textarea', () => {
    expect(projectFormSchema.safeParse({ ...base, repoUrlsText: '' }).success).toBe(true);
    expect(projectFormSchema.safeParse({ ...base, repoUrlsText: undefined }).success).toBe(true);
  });

  it('validates each non-empty repo line is a URL', () => {
    expect(
      projectFormSchema.safeParse({
        ...base,
        repoUrlsText: 'https://github.com/o/r\n\nhttps://x.io',
      }).success
    ).toBe(true);
    expect(
      projectFormSchema.safeParse({ ...base, repoUrlsText: 'https://ok.io\nnot-a-url' }).success
    ).toBe(false);
  });
});
