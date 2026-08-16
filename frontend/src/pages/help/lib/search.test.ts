import { describe, expect, it } from 'vitest';
import {
  escapeRegExp,
  findMatchPositions,
  highlightMarks,
  highlightSnippet,
  snippetAt,
  stripHtml,
} from './search';

/* Pure helpers ported 1:1 from the legacy help.html inline script — line
 * references in search.ts. */

describe('stripHtml (legacy :657-659)', () => {
  it('replaces tags with spaces and collapses whitespace', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>  again ')).toBe('Hello world again');
  });

  it('returns an empty string for null/empty input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });
});

describe('escapeRegExp (legacy :661-663)', () => {
  it('escapes regex metacharacters so terms match literally', () => {
    const literal = 'a.b*c(d)e+f?g[h]i{j}k|l^m$n\\o';
    expect(new RegExp(escapeRegExp(literal)).test(literal)).toBe(true);
    expect(escapeRegExp('')).toBe('');
  });
});

describe('findMatchPositions (legacy :795-800)', () => {
  it('finds up to 3 case-insensitive match offsets', () => {
    expect(findMatchPositions('tool and Tool and TOOL and tool', 'tool')).toEqual([0, 9, 18]);
  });

  it('returns no positions for an empty term', () => {
    expect(findMatchPositions('some text', '')).toEqual([]);
  });
});

describe('snippetAt (legacy :805-807)', () => {
  const text = 'x'.repeat(200);

  it('slices 55 chars before and 80 after a middle match', () => {
    expect(snippetAt(text, 100)).toBe(text.slice(45, 180));
  });

  it('clamps at both ends near the string boundaries', () => {
    expect(snippetAt(text, 2)).toBe(text.slice(0, 82));
    expect(snippetAt(text, 199)).toBe(text.slice(144, 200));
  });
});

describe('highlightMarks (legacy applySearch :701-710)', () => {
  it('wraps matches in text segments but never inside tags', () => {
    expect(highlightMarks('<p>abc abc</p>', 'abc')).toBe('<p><mark>abc</mark> <mark>abc</mark></p>');
    // the href attribute is a tag segment and stays untouched
    expect(highlightMarks('<a href="x">ax</a>', 'a')).toBe('<a href="x"><mark>a</mark>x</a>');
  });

  it('matches case-insensitively', () => {
    expect(highlightMarks('<p>Tool</p>', 'tool')).toBe('<p><mark>Tool</mark></p>');
  });

  it('returns the html unchanged for an empty term or empty html', () => {
    expect(highlightMarks('<p>abc</p>', '')).toBe('<p>abc</p>');
    expect(highlightMarks('', 'abc')).toBe('');
  });
});

describe('highlightSnippet (hardened legacy :754-755)', () => {
  it('escapes markup in the snippet before wrapping the term', () => {
    expect(highlightSnippet('<b>bold tool</b>', 'tool')).toBe(
      '&lt;b&gt;bold <mark>tool</mark>&lt;/b&gt;',
    );
  });

  it('returns only escaped text when there is no term', () => {
    expect(highlightSnippet('a < b', '')).toBe('a &lt; b');
  });
});
