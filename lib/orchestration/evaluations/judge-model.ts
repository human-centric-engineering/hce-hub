/**
 * Shared resolver for the independent "judge" model used by
 * evaluation scoring and the `supervisor` workflow step.
 *
 * The rule (kept here so it lives in one place):
 *   1. `EVALUATION_JUDGE_PROVIDER` / `EVALUATION_JUDGE_MODEL` win when set.
 *   2. Otherwise fall through to `EVALUATION_DEFAULT_PROVIDER` /
 *      `EVALUATION_DEFAULT_MODEL`.
 *   3. Otherwise the hard-coded fallback (`anthropic` / `claude-sonnet-4-6`).
 *
 * Both callers want the same fallthrough so a deployment that only sets
 * the default still gets a sensible judge — and a deployment that wants
 * to point the judge at a stronger model can do so with two env vars.
 *
 * Platform-agnostic: no Next.js imports.
 */

const DEFAULT_PROVIDER = 'anthropic';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

export const EVALUATION_DEFAULT_PROVIDER =
  process.env.EVALUATION_DEFAULT_PROVIDER ?? DEFAULT_PROVIDER;
export const EVALUATION_DEFAULT_MODEL = process.env.EVALUATION_DEFAULT_MODEL ?? DEFAULT_MODEL;

export const JUDGE_PROVIDER = process.env.EVALUATION_JUDGE_PROVIDER ?? EVALUATION_DEFAULT_PROVIDER;
export const JUDGE_MODEL = process.env.EVALUATION_JUDGE_MODEL ?? EVALUATION_DEFAULT_MODEL;
