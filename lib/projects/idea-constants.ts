/**
 * Shared idea constants (f-idea-capture §22). Kept dependency-free (no prisma) so
 * both the server schemas and the client inbox components import the SAME cap —
 * the two write faces (capture + update) and the UI can't drift.
 */

/**
 * Max length of an idea's text. Deliberately generous (not a one-liner): capture
 * is meant to be **lossless**, and real ideas — the futures/inbox backlog this
 * inbox ingests — are thought-through paragraphs, not quick jots. `Idea.text` is
 * `@db.Text`, so this is a sanity backstop, not a storage limit.
 */
export const IDEA_TEXT_MAX = 2000;
