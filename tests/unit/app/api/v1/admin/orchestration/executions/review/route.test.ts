/**
 * Unit test for POST /api/v1/admin/orchestration/executions/:id/review.
 *
 * Mocks the supervisor core, Prisma, the provider manager and the
 * model registry. Asserts auth, ownership, terminal-status guard,
 * happy path column writes, and re-entry archive into
 * `supervisorReport.previousVerdicts[]`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAdminUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

// ─── Mocks (declared before imports) ────────────────────────────────────────

vi.mock('@/lib/auth/config', () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiWorkflowExecution: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@/lib/security/rate-limit', () => ({
  adminLimiter: { check: vi.fn(() => ({ success: true })) },
  createRateLimitResponse: vi.fn(() =>
    Response.json({ success: false, error: { code: 'RATE_LIMITED' } }, { status: 429 })
  ),
}));
vi.mock('@/lib/security/ip', () => ({ getClientIP: vi.fn(() => '127.0.0.1') }));
vi.mock('@/lib/orchestration/llm/provider-manager', () => ({
  getProvider: vi.fn(),
}));
vi.mock('@/lib/orchestration/llm/model-registry', () => ({
  getModel: vi.fn(),
}));
vi.mock('@/lib/orchestration/llm/cost-tracker', () => ({
  calculateCost: vi.fn(() => ({ totalCostUsd: 0.001, isLocal: false })),
  logCost: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/orchestration/supervisor', async () => {
  // Keep the type exports; replace runSupervisorAssessment.
  const actual = await vi.importActual<typeof import('@/lib/orchestration/supervisor')>(
    '@/lib/orchestration/supervisor'
  );
  return {
    ...actual,
    runSupervisorAssessment: vi.fn(),
  };
});

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { POST } from '@/app/api/v1/admin/orchestration/executions/[id]/review/route';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db/client';
import { getModel } from '@/lib/orchestration/llm/model-registry';
import { getProvider } from '@/lib/orchestration/llm/provider-manager';
import { runSupervisorAssessment } from '@/lib/orchestration/supervisor';

// ─── Helpers ────────────────────────────────────────────────────────────────

const EXEC_ID = 'cmjbv4i3x00003wsloputgwu9';

function makeRequest(body: unknown = {}): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/admin/orchestration/executions/${EXEC_ID}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function makeContext(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: EXEC_ID }) };
}

function happyExecution(): Record<string, unknown> {
  return {
    id: EXEC_ID,
    userId: 'cmjbv4i3x00003wsloputgwul',
    workflowId: 'wf-1',
    status: 'completed',
    inputData: { foo: 'bar' },
    outputData: { result: 'ok' },
    executionTrace: [
      {
        stepId: 's1',
        stepType: 'llm_call',
        label: 'first step',
        status: 'completed',
        output: 'applied 5 changes',
        startedAt: '2026-05-17T10:00:00.000Z',
        completedAt: '2026-05-17T10:00:01.000Z',
        durationMs: 1000,
        tokensUsed: 50,
        costUsd: 0.001,
      },
    ],
    supervisorVerdict: null,
    supervisorScore: null,
    supervisorReport: null,
    supervisorReviewedAt: null,
  };
}

function happyAssessment(): {
  report: Record<string, unknown>;
  tokensUsed: number;
  costUsd: number;
} {
  return {
    report: {
      verdict: 'pass',
      score: 0.9,
      summary: 'all good',
      strengths: [],
      weaknesses: [],
      anomalies: [],
      unverifiedAreas: [],
      confidence: 'high',
      triggeredBy: 'retroactive',
    },
    tokensUsed: 200,
    costUsd: 0.01,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser() as never);
  vi.mocked(getModel).mockReturnValue({
    provider: 'anthropic',
    name: 'judge',
    contextLength: 200_000,
  } as never);
  vi.mocked(getProvider).mockResolvedValue({
    chat: vi.fn().mockResolvedValue({
      content: '{}',
      usage: { inputTokens: 100, outputTokens: 100 },
    }),
  } as never);
  vi.mocked(runSupervisorAssessment).mockResolvedValue(happyAssessment() as never);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/admin/orchestration/executions/:id/review', () => {
  it('rejects unauthenticated requests', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser() as never);
    const res = await POST(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 404 when the execution does not exist', async () => {
    vi.mocked(prisma.aiWorkflowExecution.findUnique).mockResolvedValue(null);
    const res = await POST(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 404 when the execution belongs to another user', async () => {
    vi.mocked(prisma.aiWorkflowExecution.findUnique).mockResolvedValue({
      ...happyExecution(),
      userId: 'someone-else',
    } as never);
    const res = await POST(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 409 when the execution is still running', async () => {
    vi.mocked(prisma.aiWorkflowExecution.findUnique).mockResolvedValue({
      ...happyExecution(),
      status: 'running',
    } as never);
    const res = await POST(makeRequest(), makeContext());
    expect(res.status).toBe(409);
  });

  it('returns 409 when the trace has no completed steps', async () => {
    vi.mocked(prisma.aiWorkflowExecution.findUnique).mockResolvedValue({
      ...happyExecution(),
      executionTrace: [
        {
          stepId: 's1',
          stepType: 'llm_call',
          label: 'failed',
          status: 'failed',
          error: 'boom',
          startedAt: '2026-05-17T10:00:00.000Z',
          durationMs: 1,
          tokensUsed: 0,
          costUsd: 0,
        },
      ],
    } as never);
    const res = await POST(makeRequest(), makeContext());
    expect(res.status).toBe(409);
  });

  it('writes the four supervisor columns on happy path and returns the verdict', async () => {
    vi.mocked(prisma.aiWorkflowExecution.findUnique).mockResolvedValue(happyExecution() as never);
    vi.mocked(prisma.aiWorkflowExecution.update).mockResolvedValue({} as never);

    const res = await POST(makeRequest(), makeContext());
    const body = (await res.json()) as { success: boolean; data: { verdict: string } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.verdict).toBe('pass');

    expect(prisma.aiWorkflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXEC_ID },
        data: expect.objectContaining({
          supervisorVerdict: 'pass',
          supervisorScore: 0.9,
          supervisorReport: expect.any(Object),
          supervisorReviewedAt: expect.any(Date),
        }),
      })
    );
  });

  it('archives prior verdict into previousVerdicts[] on re-entry', async () => {
    vi.mocked(prisma.aiWorkflowExecution.findUnique).mockResolvedValue({
      ...happyExecution(),
      supervisorVerdict: 'concerns',
      supervisorScore: 0.5,
      supervisorReviewedAt: new Date('2026-05-16T10:00:00.000Z'),
      supervisorReport: {
        verdict: 'concerns',
        score: 0.5,
        summary: 'older',
        strengths: [],
        weaknesses: [],
        anomalies: [],
        unverifiedAreas: [],
        confidence: 'medium',
        triggeredBy: 'in_workflow',
      },
    } as never);
    vi.mocked(prisma.aiWorkflowExecution.update).mockResolvedValue({} as never);

    const res = await POST(makeRequest(), makeContext());
    expect(res.status).toBe(200);

    const call = vi.mocked(prisma.aiWorkflowExecution.update).mock.calls[0][0];
    const reportWritten = call.data.supervisorReport as {
      previousVerdicts?: Array<{ verdict: string; triggeredBy: string }>;
    };
    expect(reportWritten.previousVerdicts).toBeDefined();
    expect(reportWritten.previousVerdicts).toHaveLength(1);
    expect(reportWritten.previousVerdicts![0]).toMatchObject({
      verdict: 'concerns',
      triggeredBy: 'in_workflow',
    });
  });

  it('passes triggeredBy=retroactive to runSupervisorAssessment', async () => {
    vi.mocked(prisma.aiWorkflowExecution.findUnique).mockResolvedValue(happyExecution() as never);
    vi.mocked(prisma.aiWorkflowExecution.update).mockResolvedValue({} as never);
    await POST(makeRequest(), makeContext());
    expect(vi.mocked(runSupervisorAssessment).mock.calls[0][0]).toMatchObject({
      triggeredBy: 'retroactive',
    });
  });
});
