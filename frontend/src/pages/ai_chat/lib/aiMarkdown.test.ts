import { describe, expect, it } from 'vitest';
import { normalizeMarkdownTables } from './aiMarkdown';

describe('normalizeMarkdownTables', () => {
  it('keeps a markdown table together when prose precedes the header', () => {
    const markdown = 'Results:\n| Name | Score |\n| --- | ---: |\n| BTC | 1 |';

    expect(normalizeMarkdownTables(markdown)).toContain(
      'Results:\n\n| Name | Score |\n| --- | ---: |\n| BTC | 1 |',
    );
  });

  it('does not reinterpret table-looking lines inside fenced code', () => {
    const markdown = '```text\n| Name | Score |\n| --- | ---: |\n```';

    expect(normalizeMarkdownTables(markdown)).toBe(markdown);
  });
});
