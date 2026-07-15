/**
 * Unit: host-platform descriptors (f-project-admin §7 stub).
 */
import { describe, it, expect } from 'vitest';
import {
  HOST_PLATFORMS,
  HOST_PLATFORM_SLUGS,
  isKnownHostPlatform,
  getHostPlatform,
} from '@/lib/projects/host-platforms';

describe('host-platforms', () => {
  it('supports sunrise for real and stubs the rest', () => {
    expect(getHostPlatform('sunrise')?.supported).toBe(true);
    const stubs = HOST_PLATFORMS.filter((p) => p.slug !== 'sunrise');
    expect(stubs.length).toBeGreaterThan(0);
    expect(stubs.every((p) => p.supported === false)).toBe(true);
  });

  it('HOST_PLATFORM_SLUGS matches the descriptor slugs', () => {
    expect(HOST_PLATFORM_SLUGS).toEqual(HOST_PLATFORMS.map((p) => p.slug));
  });

  it('isKnownHostPlatform accepts known slugs and rejects the rest', () => {
    expect(isKnownHostPlatform('sunrise')).toBe(true);
    expect(isKnownHostPlatform('laravel-forge')).toBe(true);
    expect(isKnownHostPlatform('wordpress')).toBe(false);
    expect(isKnownHostPlatform('')).toBe(false);
  });

  it('getHostPlatform returns undefined for an unknown slug', () => {
    expect(getHostPlatform('nope')).toBeUndefined();
  });
});
