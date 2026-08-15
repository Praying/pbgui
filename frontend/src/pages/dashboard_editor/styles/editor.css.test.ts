import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* Parity lock: editor.css must carry the exact CSS of the legacy editor page
   (dashboard_editor.html <style> block, lines 15-454). The legacy page stays
   live until D-editor-8 — this test fails loudly if the two ever drift. */

const editorCss = readFileSync(join(import.meta.dirname, 'editor.css'), 'utf8');

function legacyCss(): string {
  const source = readFileSync(join(import.meta.dirname, '../../../../dashboard_editor.html'), 'utf8');
  const match = /<style>([\s\S]*?)<\/style>/.exec(source);
  if (!match) throw new Error('could not locate the <style> block in dashboard_editor.html');
  return match[1]!;
}

function normalize(text: string): string {
  /* Comments are stripped; only the line breaks are removed — the legacy
     block's inner indentation is content and editor.css reproduces it
     verbatim, so removing \n reconstructs the exact legacy text. */
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\r?\n/g, '')
    .trim();
}

describe('editor.css vs dashboard_editor.html <style> (15-454)', () => {
  it('carries every editor rule the legacy page styles', () => {
    const legacy = legacyCss();
    expect(legacy.length).toBeGreaterThan(8000); // sanity: the real style block
    expect(normalize(editorCss)).toBe(normalize(legacy));
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
