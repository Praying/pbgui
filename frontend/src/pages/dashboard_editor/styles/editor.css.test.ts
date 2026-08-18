import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/* editor.css is the frozen port of the legacy editor page's <style> block
   (dashboard_editor.html lines 15-454). The legacy page was removed at
   D-editor-8 after byte-parity was verified; the digest below was computed
   from that verified-parity content, so any CSS drift — accidental or
   deliberate — must consciously update this expectation. */

const editorCss = readFileSync(join(import.meta.dirname, 'editor.css'), 'utf8');

/** sha256 of the normalized CSS; re-frozen at the style-unification pass
   (hardcoded colors redirected to the shared @/styles/tokens.css). */
const FROZEN_EDITOR_CSS_SHA256 = '6bcf1dc1cf1192115573acf4e09c7bb13945983496f763ef40999dbe1e8205b4';

function normalize(text: string): string {
  /* Comments are stripped; only the line breaks are removed — the legacy
     block's inner indentation is content and editor.css reproduces it
     verbatim, so removing \n reconstructs the exact legacy text. */
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\r?\n/g, '')
    .trim();
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

describe('editor.css — frozen port of the legacy editor <style> (15-454)', () => {
  it('stays byte-identical to the verified-parity port (frozen digest)', () => {
    const normalized = normalize(editorCss);
    expect(normalized.length).toBeGreaterThan(8000); // sanity: the real stylesheet
    expect(sha256(normalized)).toBe(FROZEN_EDITOR_CSS_SHA256);
  });

  it('keeps the grid/cell/resize rules the grid engine depends on', () => {
    const normalized = normalize(editorCss);
    for (const cls of [
      '.editor-grid',
      '.editor-grid-col',
      '.editor-cell',
      '.editor-cell.drag-over',
      '.drop-hint',
      '.resize-handle',
      '.resize-btn-min',
      '.type-badge.type-PPL', // R11: P+L badge class
      '.msel-drop.open',
      '.msel-item.selected',
      '.lt-thumb.active',
      '.lt-dim',
      '.palette-item',
      '.cell-trash',
      '.editor-cell.auto-height',
    ]) {
      expect(normalized).toContain(cls);
    }
  });

  it('keeps the hidden legacy header/cfg rules (display:none parity)', () => {
    /* .cell-header/.cell-cfg are display:none !important in legacy — the Vue
       grid does not emit them, but the CSS contract stays frozen. */
    expect(normalize(editorCss)).toContain('.cell-header,.cell-cfg { display: none !important; }');
  });
});
