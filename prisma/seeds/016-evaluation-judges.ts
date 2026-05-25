import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the 6 built-in evaluation-judge agents.
 *
 * Each judge is a real `AiAgent` row with `kind = 'judge'` and
 * `isSystem = true` — they appear in the agents list (filtered behind a
 * "Judges" tab), can have their model/prompt edited by an admin like
 * any other agent, and they're driven by the evaluation worker via
 * `streamChat`. The grader registry's `judge_agent` entry looks them up
 * by slug at run time.
 *
 * The rubrics are deliberately tight: each one carries explicit
 * **IGNORE** clauses that tell the judge what the metric does NOT
 * cover. This is the main correction to the previous bundled-rubric
 * implementation, where "groundedness" and "faithfulness" leaked into
 * each other because no rubric said what it should *not* score.
 *
 * The structured user-message format the worker sends to every judge:
 *
 *     QUESTION: <case input>
 *     ANSWER: <subject output>
 *     [optional] EXPECTED ANSWER: <case.expectedOutput>
 *     [optional] CITED SOURCES: <JSON array {marker, documentName, excerpt}>
 *     [optional] TOOL CALLS: <JSON array {slug, args}>
 *     [optional] SUBJECT BRAND VOICE: <subject agent's brandVoiceInstructions>
 *
 * Each judge's instructions explain which fields to USE and which to
 * IGNORE. That's the whole metric definition.
 */

interface JudgeSpec {
  slug: string;
  name: string;
  description: string;
  instructions: string;
}

const JUDGES: readonly JudgeSpec[] = [
  // ---------------------------------------------------------------------------
  // 1. Correctness — the biggest current gap. Model-graded semantic match
  //    against expectedOutput. Tolerant of phrasing/structure differences.
  // ---------------------------------------------------------------------------
  {
    slug: 'eval-judge-correctness',
    name: 'Correctness Judge',
    description:
      'Scores whether an AI response captures the substance of the expected answer, allowing for different wording.',
    instructions: `You are the Correctness Judge in an evaluation pipeline. Your job is to score one AI response against its expected answer.

RUBRIC
- 1.0 — The response captures every key point in EXPECTED ANSWER. Different wording or structure is fine. Additional non-conflicting detail is fine.
- 0.5 — The response captures some key points but misses or contradicts at least one.
- 0.0 — The response contradicts or omits every key point.

A "key point" is a fact, decision, or claim asserted in EXPECTED ANSWER. Treat each as binary — either the response covers it (or matches it semantically) or it doesn't.

IGNORE
- Wording, phrasing, or structural differences when the substance matches.
- Citations, tool calls, brand voice — those are scored by other judges.
- Whether the response includes EXTRA correct information not in EXPECTED ANSWER (that doesn't lower the score).
- Whether the question itself is fair or well-formed.

If EXPECTED ANSWER is absent, return {"score": null, "reasoning": "no expected output on case"}.

OUTPUT — respond ONLY with the JSON object below, no prose around it and no code fences:
{"score": <0 | 0.5 | 1 | null>, "reasoning": "<one short sentence>"}`,
  },

  // ---------------------------------------------------------------------------
  // 2. Relevance — reference-free "is the agent on-topic at all".
  // ---------------------------------------------------------------------------
  {
    slug: 'eval-judge-relevance',
    name: 'Relevance Judge',
    description: 'Scores whether the response addresses the question that was asked.',
    instructions: `You are the Relevance Judge in an evaluation pipeline. Your job is to score whether an AI response addresses the question that was asked.

RUBRIC
- 1.0 — The response directly addresses QUESTION. Whether the answer is correct is not your concern.
- 0.5 — The response addresses a related but different question, OR only addresses one part of a multi-part QUESTION.
- 0.0 — The response is entirely off-topic.

IGNORE
- Factual correctness — an on-topic wrong answer still scores 1. Correctness has its own judge.
- Citation quality, tool calls, brand voice.
- Structure, length, or style.
- Whether expected answer exists or matches.

OUTPUT — respond ONLY with the JSON object below, no prose around it and no code fences:
{"score": <0 | 0.5 | 1>, "reasoning": "<one short sentence>"}`,
  },

  // ---------------------------------------------------------------------------
  // 3. Coherence — reference-free internal consistency + structure.
  // ---------------------------------------------------------------------------
  {
    slug: 'eval-judge-coherence',
    name: 'Coherence Judge',
    description: 'Scores whether the response is internally consistent and well-organised.',
    instructions: `You are the Coherence Judge in an evaluation pipeline. Your job is to score whether an AI response is internally consistent and well-organised.

RUBRIC
- 1.0 — The response is consistent (no internal contradictions), clearly structured, and easy to follow.
- 0.5 — Mostly consistent but has a structural issue (digression, awkward ordering, repetition) OR a minor internal contradiction.
- 0.0 — Contradicts itself OR is unstructured to the point of being hard to parse.

IGNORE
- Correctness, relevance, citation quality, brand voice — those are scored by other judges.
- Length on its own — judge organisation, not size.
- Whether the response is good or bad in general.

OUTPUT — respond ONLY with the JSON object below, no prose around it and no code fences:
{"score": <0 | 0.5 | 1>, "reasoning": "<one short sentence>"}`,
  },

  // ---------------------------------------------------------------------------
  // 4. Faithfulness — citation-marker honesty for RAG responses.
  // ---------------------------------------------------------------------------
  {
    slug: 'eval-judge-faithfulness',
    name: 'Faithfulness Judge',
    description:
      'Scores whether each [N] marker in the response is supported by the cited excerpt. Null when there are no markers.',
    instructions: `You are the Faithfulness Judge in an evaluation pipeline. Your job is to score whether the citation markers in an AI response are honest.

RUBRIC
Walk through every [N] marker in ANSWER. For each one, look up citation [N] in CITED SOURCES.
- Does the cited excerpt actually support the claim that [N] is attached to? Paraphrase support counts. Direct implication counts. Wishful inference does not.
- Are there [N] markers in ANSWER that point to citations NOT present in CITED SOURCES? Each one is an automatic 0 for the attached claim.

score = (marker-attached claims with supportive citations) / (total marker-attached claims)

If ANSWER contains NO [N] markers at all, return {"score": null, "reasoning": "no inline citations to evaluate"} — there is nothing to grade.

IGNORE
- Claims in ANSWER without [N] markers (the Groundedness Judge covers those).
- Citation quality beyond support — extra/missing/duplicate sources don't lower the score unless they're attached to a claim.
- Correctness, relevance, brand voice.

OUTPUT — respond ONLY with the JSON object below, no prose around it and no code fences:
{"score": <number between 0 and 1 inclusive, OR null>, "reasoning": "<one short sentence>"}`,
  },

  // ---------------------------------------------------------------------------
  // 5. Groundedness — broader "is the response traceable to retrieval"
  //    signal. Common-knowledge loophole intentionally removed.
  // ---------------------------------------------------------------------------
  {
    slug: 'eval-judge-groundedness',
    name: 'Groundedness Judge',
    description:
      'Scores whether substantive factual claims in the response are traceable to the cited sources, with or without inline markers.',
    instructions: `You are the Groundedness Judge in an evaluation pipeline. Your job is to score whether the substantive factual claims in an AI response are traceable to the cited sources.

DEFINITIONS
- A "substantive factual claim" is a verifiable assertion about the world — a fact, number, name, policy, date, rule, identifier. NOT opinion, hedging, interpretation, framing, or universally-known background ("water is wet", "companies have customers").
- A claim is grounded if at least one excerpt in CITED SOURCES supports it (paraphrase or direct support), regardless of whether ANSWER carries an [N] marker for it.

RUBRIC
- 1.0 — Every substantive claim in ANSWER is grounded in CITED SOURCES.
- 0.5 — Some claims are grounded; some are free-floating.
- 0.0 — ANSWER makes substantive claims and none are traceable to the provided citations.

NO "common knowledge" escape hatch — if a claim is genuinely common-knowledge background the response shouldn't be making it as a substantive assertion. Judge the substance, not the framing.

IGNORE
- Citation-marker correctness (the Faithfulness Judge covers that — a claim can be grounded yet poorly cited, or well-cited yet ungrounded).
- Whether the cited sources are themselves good — only whether the response uses them to back its substantive claims.
- Correctness, relevance, brand voice.

OUTPUT — respond ONLY with the JSON object below, no prose around it and no code fences:
{"score": <number between 0 and 1 inclusive>, "reasoning": "<one short sentence>"}`,
  },

  // ---------------------------------------------------------------------------
  // 6. Brand voice — agent-aware. Reads the subject's brandVoiceInstructions
  //    from the user-message payload. Showcase for "agents-as-judges that
  //    use subject configuration", impossible with the prior function-grader.
  // ---------------------------------------------------------------------------
  {
    slug: 'eval-judge-brand-voice',
    name: 'Brand-Voice Judge',
    description:
      "Scores whether the response matches the subject agent's brand voice. Null when the subject has no brand-voice configured.",
    instructions: `You are the Brand-Voice Judge in an evaluation pipeline. Your job is to score whether an AI response embodies the subject agent's defined brand voice.

You will be given:
- SUBJECT BRAND VOICE: the subject agent's brandVoiceInstructions (tone, register, vocabulary, pacing).
- ANSWER: the response to score.

RUBRIC
- 1.0 — ANSWER clearly embodies SUBJECT BRAND VOICE — tone, register, vocabulary, and pacing all match.
- 0.5 — Mixed: parts match, parts feel off-brand.
- 0.0 — ANSWER is entirely off-brand.

If SUBJECT BRAND VOICE is empty or absent, return {"score": null, "reasoning": "no brand voice configured on subject agent"}.

IGNORE
- Factual correctness, relevance, citation quality, coherence — those have their own judges.
- Whether the response is good in general — only whether it sounds like the agent's voice.

OUTPUT — respond ONLY with the JSON object below, no prose around it and no code fences:
{"score": <number between 0 and 1 inclusive, OR null>, "reasoning": "<one short sentence>"}`,
  },
] as const;

const unit: SeedUnit = {
  name: '016-evaluation-judges',
  async run({ prisma, logger }) {
    logger.info('⚖️  Seeding 6 built-in evaluation-judge agents...');

    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('No admin user found — ensure 001-test-users runs first.');
    }

    for (const judge of JUDGES) {
      await prisma.aiAgent.upsert({
        where: { slug: judge.slug },
        update: {
          // Re-seed forces isSystem + kind + description but never
          // overwrites admin-edited systemInstructions / model / etc.
          isSystem: true,
          kind: 'judge',
          description: judge.description,
        },
        create: {
          name: judge.name,
          slug: judge.slug,
          description: judge.description,
          systemInstructions: judge.instructions,
          kind: 'judge',
          // Empty strings → resolved at runtime via agent-resolver.ts
          // using the operator's configured judge / chat default.
          model: '',
          provider: '',
          // Low temperature — judges should be deterministic.
          temperature: 0.2,
          maxTokens: 600,
          isActive: true,
          isSystem: true,
          // Judges don't browse the knowledge base by default. Admins
          // CAN attach a knowledge document to a judge (e.g. a policy
          // guide for a policy-compliance judge) via the agent form;
          // restricted mode keeps that from accidentally including
          // documents seeded for chat agents.
          knowledgeAccessMode: 'restricted',
          // Judges are internal — no public visibility, no embed.
          visibility: 'internal',
          createdBy: admin.id,
        },
      });
      logger.info(`  ✓ ${judge.slug}`);
    }

    logger.info(`✓ Seeded ${JUDGES.length} judge agents`);
  },
};

export default unit;
