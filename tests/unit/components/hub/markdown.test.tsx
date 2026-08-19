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

  it('strips dangerous URL schemes from markdown links', () => {
    // Escaping raw HTML is only half the guarantee: `[x](javascript:…)` is
    // ordinary markdown, so it survives the HTML escape and becomes a real
    // anchor. react-markdown's default `urlTransform` blanks it — pinned here
    // because the guarantee is a DEFAULT, and passing a custom `urlTransform`
    // (or an older major) would silently remove it. Every caller of this
    // component renders member-authored text: task/feature detail, journal
    // decision + note bodies, and idea jots.
    const { container } = render(
      <Markdown content={'[a](javascript:alert(1))\n\n[b](data:text/html,hi)'} />
    );
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['', '']);
  });

  it('keeps an ordinary https link intact', () => {
    // The counterweight: the check above must be sanitisation, not "links are
    // broken". A test that only asserts the blanking would pass on both.
    const { container } = render(<Markdown content={'[a](https://example.com/x)'} />);
    expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.com/x');
  });
});
