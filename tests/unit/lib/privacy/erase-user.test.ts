/**
 * Unit tests for lib/privacy/erase-user.ts
 *
 * Contract under test:
 *   eraseUser({ userId, userEmail, actorUserId, reason })
 *   1. best-effort avatar blob cleanup (outside the DB transaction)
 *   2. prisma.$transaction → scrub clientIp | write receipt | delete user
 *   3. returns { receiptId, erasedAt } from the created receipt row
 */

import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables exist before vi.mock() factories run
// ---------------------------------------------------------------------------

const { mockUpdateMany, mockReceiptCreate, mockUserDelete, mockPrisma, mockLogger } = vi.hoisted(
  () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const receiptCreate = vi.fn().mockResolvedValue({
      id: 'receipt-1',
      erasedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const userDelete = vi.fn().mockResolvedValue({ id: 'user-1' });

    // Prisma mock — $transaction invokes its async callback with the same
    // prisma mock so tx.X === prisma.X; this is the pattern described in the
    // test plan's brittle-patterns note (a no-op mock makes downstream
    // assertions vacuous).
    const prismaObj = {
      $transaction: vi.fn(),
      aiAdminAuditLog: { updateMany },
      dataErasureReceipt: { create: receiptCreate },
      user: { delete: userDelete },
    };
    prismaObj.$transaction.mockImplementation(
      (callback: (tx: typeof prismaObj) => Promise<unknown>) => callback(prismaObj)
    );

    const log = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
      withContext: vi.fn(),
    };

    return {
      mockUpdateMany: updateMany,
      mockReceiptCreate: receiptCreate,
      mockUserDelete: userDelete,
      mockPrisma: prismaObj,
      mockLogger: log,
    };
  }
);

vi.mock('@/lib/logging', () => ({
  logger: mockLogger,
}));

vi.mock('@/lib/db/client', () => ({
  prisma: mockPrisma,
}));

// Storage — dynamically imported by the source; mock the module so dynamic
// import picks up the mock at runtime.
const { mockIsStorageEnabled, mockDeleteByPrefix } = vi.hoisted(() => ({
  mockIsStorageEnabled: vi.fn().mockReturnValue(false),
  mockDeleteByPrefix: vi.fn().mockResolvedValue({ deleted: 1 }),
}));

vi.mock('@/lib/storage/upload', () => ({
  isStorageEnabled: mockIsStorageEnabled,
  deleteByPrefix: mockDeleteByPrefix,
}));

// ---------------------------------------------------------------------------
// Import under test (AFTER all vi.mock() calls)
// ---------------------------------------------------------------------------

import { eraseUser } from '@/lib/privacy/erase-user';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  userId: 'user-42',
  userEmail: 'foo@bar.com',
  actorUserId: 'admin-99',
  reason: 'admin_action' as const,
};

// Independent sha256 computation — do NOT copy-paste from the impl.
function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('eraseUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore defaults that clearAllMocks resets (mock implementations, not
    // just call history).
    mockIsStorageEnabled.mockReturnValue(false);
    mockDeleteByPrefix.mockResolvedValue({ deleted: 1 });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockReceiptCreate.mockResolvedValue({
      id: 'receipt-1',
      erasedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    mockUserDelete.mockResolvedValue({ id: BASE_PARAMS.userId });
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Case 1: Happy path — all three collaborators called; return shape correct
  // -------------------------------------------------------------------------

  it('happy path — calls all three transaction steps and returns { receiptId, erasedAt } matching the created receipt', async () => {
    // Arrange
    mockIsStorageEnabled.mockReturnValue(false); // storage off — not the focus here
    const receiptRow = { id: 'r-happy', erasedAt: new Date('2026-03-15T10:00:00.000Z') };
    mockReceiptCreate.mockResolvedValue(receiptRow);

    // Act
    const result = await eraseUser(BASE_PARAMS);

    // Assert — return value is derived from the created receipt row, not echo of inputs
    expect(result).toEqual({ receiptId: receiptRow.id, erasedAt: receiptRow.erasedAt });
    // All three transaction steps executed
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockReceiptCreate).toHaveBeenCalledTimes(1);
    expect(mockUserDelete).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Case 2: Scrub — exact args passed to aiAdminAuditLog.updateMany
  // -------------------------------------------------------------------------

  it('scrub — aiAdminAuditLog.updateMany called with { where: { userId }, data: { clientIp: null } }', async () => {
    // Arrange
    const { userId } = BASE_PARAMS;

    // Act
    await eraseUser(BASE_PARAMS);

    // Assert — the route COMPUTED these args from params; not just what the
    // mock returned
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId },
      data: { clientIp: null },
    });
  });

  // -------------------------------------------------------------------------
  // Case 3: Receipt args — verified by independently-computed sha256
  // -------------------------------------------------------------------------

  it('receipt args — dataErasureReceipt.create called with correct subjectUserId, actorUserId, reason, and sha256 hash of email', async () => {
    // Arrange — compute the expected hash independently (not copied from impl)
    const expectedHash = sha256Hex('foo@bar.com'); // trim().toLowerCase() of 'foo@bar.com'

    // Act
    await eraseUser(BASE_PARAMS);

    // Assert — verify the TRANSFORMATION the source applied to each input
    expect(mockReceiptCreate).toHaveBeenCalledWith({
      data: {
        subjectUserId: BASE_PARAMS.userId,
        subjectEmailHash: expectedHash,
        actorUserId: BASE_PARAMS.actorUserId,
        reason: BASE_PARAMS.reason,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Case 4: Email-hash normalization — padded + mixed-case treated as lowercase
  // -------------------------------------------------------------------------

  it('email-hash normalization — padded mixed-case email produces the same hash as lowercase trimmed form', async () => {
    // Arrange — two different email strings that should hash identically
    const normalizedHash = sha256Hex('foo@bar.com');
    const paddedMixedCase = '  Foo@BAR.com ';

    // Act — call with the untrimmed/mixed-case variant
    await eraseUser({ ...BASE_PARAMS, userEmail: paddedMixedCase });

    // Assert — the hash on the receipt matches what we computed for the
    // normalised string, proving the impl applied trim().toLowerCase()
    expect(mockReceiptCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ subjectEmailHash: normalizedHash }),
    });
  });

  // -------------------------------------------------------------------------
  // Case 5a: Transaction atomicity — all three steps run via $transaction
  // -------------------------------------------------------------------------

  it('transaction atomicity — scrub, receipt, and delete all execute inside the $transaction callback', async () => {
    // Arrange
    let txCallbackCaptured: ((tx: typeof mockPrisma) => Promise<unknown>) | null = null;
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
        txCallbackCaptured = callback;
        return callback(mockPrisma);
      }
    );

    // Act
    await eraseUser(BASE_PARAMS);

    // Assert — the callback was passed to $transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txCallbackCaptured).not.toBeNull();

    // All three steps ran through the tx object that was passed into the callback
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockReceiptCreate).toHaveBeenCalledTimes(1);
    expect(mockUserDelete).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Case 5b: Transaction atomicity — $transaction rejection propagates
  // -------------------------------------------------------------------------

  it('transaction atomicity — a $transaction rejection propagates out of eraseUser', async () => {
    // Arrange
    const dbError = new Error('deadlock detected');
    mockPrisma.$transaction.mockRejectedValue(dbError);

    // Act + Assert
    await expect(eraseUser(BASE_PARAMS)).rejects.toThrow('deadlock detected');
  });

  // -------------------------------------------------------------------------
  // Case 6: Storage enabled — deleteByPrefix called with correct prefix
  // -------------------------------------------------------------------------

  it('storage enabled — deleteByPrefix called once with avatars/{userId}/', async () => {
    // Arrange
    mockIsStorageEnabled.mockReturnValue(true);
    const { userId } = BASE_PARAMS;

    // Act
    await eraseUser(BASE_PARAMS);

    // Assert — the prefix is derived from userId (transformation, not echo)
    expect(mockDeleteByPrefix).toHaveBeenCalledTimes(1);
    expect(mockDeleteByPrefix).toHaveBeenCalledWith(`avatars/${userId}/`);
  });

  // -------------------------------------------------------------------------
  // Case 7: Storage disabled — deleteByPrefix NOT called
  // -------------------------------------------------------------------------

  it('storage disabled — deleteByPrefix not called when isStorageEnabled returns false', async () => {
    // Arrange — storage is already off from beforeEach default
    mockIsStorageEnabled.mockReturnValue(false);

    // Act
    await eraseUser(BASE_PARAMS);

    // Assert — explicit non-call assertion arranged cleanly (no mid-test
    // clearAllMocks, per brittle-patterns rule 4)
    expect(mockDeleteByPrefix).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 8: reason passthrough — 'admin_action' lands verbatim on receipt
  // -------------------------------------------------------------------------

  it('reason passthrough — admin_action lands verbatim on the receipt create call', async () => {
    // Arrange
    const params = { ...BASE_PARAMS, reason: 'admin_action' as const };

    // Act
    await eraseUser(params);

    // Assert — the source passed the reason through without mutation
    expect(mockReceiptCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: 'admin_action' }),
    });
  });
});
