import { describe, it, expect } from 'vitest';
import { projectFormSchema } from '@/components/admin/projects/project-form-schema';

const base = {
  name: 'Hub',
  slug: '',
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

  it('treats a blank slug as "no key supplied" (derive on create / keep on edit)', () => {
    expect(projectFormSchema.safeParse({ ...base, slug: '' }).success).toBe(true);
    expect(projectFormSchema.safeParse({ ...base, slug: '   ' }).success).toBe(true);
  });

  it('accepts the lowercase-hyphen slug shape the column allows', () => {
    for (const slug of ['hce-hub', 'a', 'sunrise-2', 'one-two-three']) {
      expect(projectFormSchema.safeParse({ ...base, slug }).success).toBe(true);
    }
  });

  it('rejects a slug the column would refuse', () => {
    for (const slug of ['HCE-Hub', 'hce hub', 'hce_hub', '-hce', 'hce-', 'hce--hub', 'a/b']) {
      expect(projectFormSchema.safeParse({ ...base, slug }).success).toBe(false);
    }
    expect(projectFormSchema.safeParse({ ...base, slug: 'a'.repeat(101) }).success).toBe(false);
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
