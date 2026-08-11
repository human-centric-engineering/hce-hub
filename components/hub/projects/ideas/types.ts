/**
 * Client-facing DTO for the Ideas inbox view (f-idea-capture §22 t-62) — the
 * serialisable shape the `/ideas` GET returns (mirrors `IdeaInboxDTO` in
 * `lib/projects/ideas.ts`, kept separate so the client tree never imports the
 * server module).
 */

/** A user reference for display; `null` means the author was erased. */
export interface IdeaAuthorRef {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/** An idea row in the inbox. */
export interface IdeaView {
  id: string;
  text: string;
  /** `open` (to triage) or `dropped` (archived, restorable). */
  status: 'open' | 'dropped';
  createdBy: IdeaAuthorRef | null;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601 — when it was dropped; `null` while open. */
  triagedAt: string | null;
}

export interface IdeaInboxDTO {
  ideas: IdeaView[];
}
