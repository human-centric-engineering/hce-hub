'use client';

// SECURITY: react-markdown escapes raw HTML by default, and only `remark-gfm`
// (a parser-level extension — tables, task lists, strikethrough, autolinks; no
// raw HTML) is enabled, so a raw `<script>` in the source renders as inert text.
// Do NOT add `rehype-raw` or `allowDangerousHtml` — that would turn authored
// task/feature detail into a stored-XSS sink.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Markdown — the Hub's shared, safe markdown renderer (f-authoring-fidelity §21).
 *
 * Renders authored task/feature detail as prose (via the `@tailwindcss/typography`
 * plugin wired in `globals.css`). Used by the task sheet (t-c) and the feature
 * page (t-d) so authored `**bold**` / lists / tables render instead of leaking
 * literal markdown.
 */
export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
