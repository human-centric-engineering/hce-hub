'use client';

/**
 * JsonPretty — renders a JSON value (or pre-stringified JSON) inside a
 * monospaced block with proper indentation and lightweight syntax
 * highlighting (keys, strings, numbers, booleans, null).
 *
 * Two layout modes:
 *
 * - Default (`wrap` false): `whitespace-pre` + `overflow-x-auto`. Long
 *   lines scroll horizontally. Best for compact previews where you
 *   want JSON shape to read clearly even when individual values are
 *   huge.
 *
 * - Wrap (`wrap` true): `whitespace-pre-wrap` + `break-words`. Newlines
 *   and indent spaces are still preserved (`pre-wrap` keeps them
 *   verbatim), but long string values wrap at the right margin —
 *   first at word boundaries, then mid-token if a single string has
 *   no break opportunities. Keys stay short and don't wrap. This is
 *   the mode the trace viewer flips into when an operator asks to
 *   read a long output without horizontal scrolling.
 *
 * The highlighter runs over `JSON.stringify` output, which is always
 * well-formed, so a regex tokenizer is sufficient. The component never
 * renders raw user-provided HTML — every span body is a JS string.
 */

import { Fragment, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface Props {
  /** Already-formatted JSON string, or any value to stringify. */
  data: unknown;
  /** Optional class names (e.g. `max-h-60 overflow-y-auto`). */
  className?: string;
  /**
   * Wrap long lines while keeping JSON indentation. Defaults to false
   * (horizontal scroll). See the file header for the contrast between
   * the two modes.
   */
  wrap?: boolean;
}

const TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

export function JsonPretty({ data, className, wrap = false }: Props) {
  const text = typeof data === 'string' ? data : safeStringify(data);

  return (
    <pre
      data-wrap={wrap ? 'true' : 'false'}
      className={cn(
        'bg-muted/40 text-foreground/90 rounded p-2 font-mono text-xs leading-relaxed',
        wrap ? 'break-words whitespace-pre-wrap' : 'overflow-x-auto whitespace-pre',
        className
      )}
    >
      {highlight(text)}
    </pre>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function highlight(json: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  TOKEN_RE.lastIndex = 0;
  for (let match = TOKEN_RE.exec(json); match !== null; match = TOKEN_RE.exec(json)) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`t${key++}`}>{json.slice(lastIndex, match.index)}</Fragment>);
    }
    const [whole, stringLit, colonSuffix, keyword] = match;
    if (stringLit !== undefined) {
      const isKey = colonSuffix !== undefined;
      nodes.push(
        <span
          key={`s${key++}`}
          className={
            isKey ? 'text-sky-700 dark:text-sky-300' : 'text-emerald-700 dark:text-emerald-300'
          }
        >
          {stringLit}
        </span>
      );
      if (isKey) {
        nodes.push(<Fragment key={`c${key++}`}>{colonSuffix}</Fragment>);
      }
    } else if (keyword !== undefined) {
      nodes.push(
        <span
          key={`k${key++}`}
          className={
            keyword === 'null' ? 'text-muted-foreground' : 'text-purple-700 dark:text-purple-300'
          }
        >
          {keyword}
        </span>
      );
    } else {
      // numeric literal — `whole` is the full match
      nodes.push(
        <span key={`n${key++}`} className="text-amber-700 dark:text-amber-300">
          {whole}
        </span>
      );
    }
    lastIndex = TOKEN_RE.lastIndex;
  }
  if (lastIndex < json.length) {
    nodes.push(<Fragment key={`t${key++}`}>{json.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}
