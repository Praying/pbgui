import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeHtmlText, hasVendorRenderer, renderMarkdown } from './markdown';

/* renderMarkdown ports legacy help.html :653-655
 * (DOMPurify.sanitize(marked.parse(md))) with a hardened escaped-text
 * fallback when the local vendor scripts are absent — see the decision
 * note in markdown.ts. */

afterEach(() => {
  delete window.marked;
  delete window.DOMPurify;
});

describe('renderMarkdown', () => {
  it('renders marked output through DOMPurify', () => {
    window.marked = { parse: (md: string) => `<p>${md}</p>` };
    const sanitize = vi.fn((html: string) => `<clean>${html}</clean>`);
    window.DOMPurify = { sanitize };

    expect(renderMarkdown('# Hi')).toBe('<clean><p># Hi</p></clean>');
    expect(sanitize).toHaveBeenCalledWith('<p># Hi</p>');
  });

  it('applies the legacy gfm/breaks options to marked', () => {
    const setOptions = vi.fn();
    window.marked = { parse: () => 'x', setOptions };
    window.DOMPurify = { sanitize: (html: string) => html };

    renderMarkdown('a');

    expect(setOptions).toHaveBeenCalledWith({ gfm: true, breaks: true });
  });

  it("coerces input with the legacy String(md || '') falsy handling", () => {
    const parse = vi.fn((md: string) => md);
    window.marked = { parse };
    window.DOMPurify = { sanitize: (html: string) => html };

    expect(renderMarkdown(0)).toBe(''); // 0 is falsy → '' (legacy parity)
    expect(parse).toHaveBeenLastCalledWith('');
    expect(renderMarkdown('# x')).toBe('# x');
    expect(parse).toHaveBeenLastCalledWith('# x');
  });

  it('falls back to fully escaped text when the vendor scripts are missing', () => {
    expect(hasVendorRenderer()).toBe(false);

    expect(renderMarkdown('<img src=x onerror=alert(1)> & <b>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt; &amp; &lt;b&gt;',
    );
  });

  it('returns an empty string for empty and null-ish input', () => {
    window.marked = { parse: (md: string) => md };
    window.DOMPurify = { sanitize: (html: string) => html };

    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
  });
});

describe('hasVendorRenderer', () => {
  it('is true only when both marked.parse and DOMPurify.sanitize exist', () => {
    expect(hasVendorRenderer()).toBe(false);
    window.marked = { parse: (md: string) => md };
    expect(hasVendorRenderer()).toBe(false);
    window.DOMPurify = { sanitize: (html: string) => html };
    expect(hasVendorRenderer()).toBe(true);
  });
});

describe('escapeHtmlText', () => {
  it('escapes &, <, > for the no-vendor fallback and snippets', () => {
    expect(escapeHtmlText('a & <b> c')).toBe('a &amp; &lt;b&gt; c');
    expect(escapeHtmlText(null)).toBe('');
    expect(escapeHtmlText(undefined)).toBe('');
  });
});
