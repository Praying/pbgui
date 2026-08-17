import { describe, expect, it } from 'vitest';
import { botHighlightLines } from './botHighlight';

/*
 * _applyBotJsonHighlight's buildHtml (v7_edit.html:3536-3576): per-line status
 * from paramStatus — a key's status paints its whole nested block; the
 * validation-error line gets the red marker. Pure line model; the component
 * renders it as escaped spans.
 */

describe('botHighlightLines', () => {
  it('marks keys present in the status map', () => {
    const lines = botHighlightLines('{\n  "grids": 3,\n  "other": 1\n}', { grids: 'neutralized' });
    expect(lines).toEqual([
      { text: '{', status: null, error: false },
      { text: '  "grids": 3,', status: 'neutralized', error: false },
      { text: '  "other": 1', status: null, error: false },
      { text: '}', status: null, error: false },
    ]);
  });

  it('paints a whole nested block with the opening key status', () => {
    const source = '{\n  "strategy": {\n    "x": 1\n  }\n}';
    const lines = botHighlightLines(source, { strategy: 'pb_default' });
    expect(lines.map((l) => l.status)).toEqual([null, 'pb_default', 'pb_default', 'pb_default', null]);
  });

  it('closes the block status when depth returns', () => {
    const source = '{\n  "a": {\n    "b": 1\n  },\n  "c": 2\n}';
    const lines = botHighlightLines(source, { a: 'neutralized' });
    expect(lines.map((l) => l.status)).toEqual([null, 'neutralized', 'neutralized', 'neutralized', null, null]);
  });

  it('keeps the block status for keys inside an open block (legacy :3548-3554)', () => {
    const source = '{\n  "a": {\n    "b": 1\n  }\n}';
    const lines = botHighlightLines(source, { a: 'neutralized', b: 'pb_default' });
    // once "a" opens a block, every nested line inherits the block status —
    // the direct key match only applies outside open blocks
    expect(lines.map((l) => l.status)).toEqual([null, 'neutralized', 'neutralized', 'neutralized', null]);
  });

  it('keeps the error line when provided', () => {
    const lines = botHighlightLines('{\n  "x": ,\n}', {}, 2);
    expect(lines[1]!.error).toBe(true);
    expect(lines[0]!.error).toBe(false);
  });
});
