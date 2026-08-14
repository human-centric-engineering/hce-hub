import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * `@/lib/env` is mocked because `vitest.config.ts` runs on happy-dom, where
 * `lib/env.ts` validates only the client schema and every server variable reads
 * as `undefined` — so the startup guard below could never be exercised for real.
 */
const mockEnv = vi.hoisted(() => ({ MCP_SESSION_MODE: 'stateless' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

import {
  getMcpRateLimiter,
  getMcpSessionManager,
  resetMcpSingletons,
} from '@/lib/orchestration/mcp/singletons';
import { McpRateLimiter } from '@/lib/orchestration/mcp/rate-limiter';
import { McpSessionManager } from '@/lib/orchestration/mcp/session-manager';

beforeEach(() => {
  resetMcpSingletons();
});

describe('singletons: getMcpSessionManager', () => {
  it('returns an McpSessionManager instance on first call', () => {
    const manager = getMcpSessionManager();
    expect(manager).toBeInstanceOf(McpSessionManager);
  });

  it('returns the same instance on repeated calls (process-wide singleton)', () => {
    const a = getMcpSessionManager();
    const b = getMcpSessionManager();
    expect(a).toBe(b);
  });

  it('returns a fresh instance after resetMcpSingletons', () => {
    const before = getMcpSessionManager();
    resetMcpSingletons();
    const after = getMcpSessionManager();
    expect(after).not.toBe(before);
  });
});

describe('singletons: getMcpRateLimiter', () => {
  it('returns an McpRateLimiter instance on first call', () => {
    expect(getMcpRateLimiter()).toBeInstanceOf(McpRateLimiter);
  });

  it('returns the same instance on repeated calls', () => {
    expect(getMcpRateLimiter()).toBe(getMcpRateLimiter());
  });

  it('returns a fresh instance after resetMcpSingletons', () => {
    const before = getMcpRateLimiter();
    resetMcpSingletons();
    const after = getMcpRateLimiter();
    expect(after).not.toBe(before);
  });
});

describe('singletons: resetMcpSingletons', () => {
  it('calls destroy() on the session manager (clears its timers)', () => {
    const manager = getMcpSessionManager();
    // Sanity: a fresh manager has the eviction timer set.
    // After reset, the manager instance is replaced — its destroy was
    // called as part of resetMcpSingletons, which calls clearInterval
    // and clears the sessions map. Re-fetching gives a different manager.
    expect(manager.getActiveSessions()).toEqual([]);
    resetMcpSingletons();
    expect(getMcpSessionManager()).not.toBe(manager);
  });

  it('is safe to call when nothing has been initialised yet', () => {
    expect(() => resetMcpSingletons()).not.toThrow();
  });
});

describe('singletons: the stateful-on-serverless startup guard (t-92)', () => {
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    mockEnv.MCP_SESSION_MODE = 'stateless';
    vi.resetModules();
  });

  /** Re-evaluate the module so its load-time guard runs against the current env. */
  async function loadSingletons(): Promise<void> {
    vi.resetModules();
    await import('@/lib/orchestration/mcp/singletons');
  }

  it('throws with the fix when stateful is selected on a serverless platform', async () => {
    // The whole point: an in-memory store cannot span instances, so this is a
    // misconfiguration that would otherwise surface as an intermittent 404
    // mid-handshake, in production, under concurrency only.
    process.env.VERCEL = '1';
    mockEnv.MCP_SESSION_MODE = 'stateful';

    await expect(loadSingletons()).rejects.toThrow(/MCP_SESSION_MODE=stateless/);
  });

  it('permits stateless on the same platform', async () => {
    process.env.VERCEL = '1';
    mockEnv.MCP_SESSION_MODE = 'stateless';

    await expect(loadSingletons()).resolves.toBeUndefined();
  });

  it('permits stateful off serverless — one long-running process is what it is for', async () => {
    delete process.env.VERCEL;
    mockEnv.MCP_SESSION_MODE = 'stateful';

    await expect(loadSingletons()).resolves.toBeUndefined();
  });
});
