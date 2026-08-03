/**
 * Unit: Markdown — the Hub's shared safe markdown renderer (f-authoring-fidelity
 * §21 t-c). Pins that markdown renders (no literal `**` leaks), gfm extensions
 * work, and — load-bearing for security — raw HTML in the source is NOT rendered
 * as markup (no rehype-raw / allowDangerousHtml).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from '@/components/hub/markdown';

describe('Markdown', () => {
  it('renders markdown emphasis (bold → <strong>), not raw asterisks', () => {
    render(<Markdown content="Build the **widget** now" />);
    expect(screen.getByText('widget').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*widget\*\*/)).toBeNull();
  });

  it('renders gfm tables', () => {
    render(<Markdown content={'| a | b |\n|---|---|\n| 1 | 2 |'} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('does NOT render raw HTML as markup — escaped, not an XSS sink', () => {
    const { container } = render(<Markdown content={'<img src=x onerror=alert(1)> hi'} />);
    // react-markdown escapes raw HTML (no rehype-raw) → no element is created.
    expect(container.querySelector('img')).toBeNull();
  });
});
