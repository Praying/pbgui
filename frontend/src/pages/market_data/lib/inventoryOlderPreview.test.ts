import { describe, expect, it } from 'vitest';
import { computeOlderPreviewView } from './inventoryOlderPreview';

/* M-data-6 — legacy renderInventoryOlderPreview :8253-8311 (the delete-by-
   date dialog's scope text, selection list and disabled-reason branches). */

const t = (key: string, params?: Record<string, unknown>): string =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe('computeOlderPreviewView (:8263-8310)', () => {
  const preview = { success: true, would_delete_files: 3, would_delete_size: 1048576, would_delete_size_label: '1.00 MB' };

  it('asks for a cutoff date first (:8283-8287)', () => {
    const view = computeOlderPreviewView({ coins: ['BTC'], coinLabels: ['BTC'], cutoffDay: '', preview, t });
    expect(view.noteText).toBe('market.selectCutoffDate');
    expect(view.canDelete).toBe(false);
  });

  it('asks for coins when the cutoff is set but nothing is selected (:8289-8293)', () => {
    const view = computeOlderPreviewView({ coins: [], coinLabels: [], cutoffDay: '2024-01-01', preview, t });
    expect(view.noteText).toBe('market.selectCoinsInTable');
    expect(view.canDelete).toBe(false);
  });

  it('reports an unavailable preview for null or failed payloads (:8295-8299)', () => {
    for (const bad of [null, { success: false, error: 'boom' }]) {
      const view = computeOlderPreviewView({ coins: ['BTC'], coinLabels: ['BTC'], cutoffDay: '2024-01-01', preview: bad, t });
      expect(view.noteText).toBe('market.previewUnavailable');
      expect(view.canDelete).toBe(false);
    }
  });

  it('reports no files when nothing would be deleted (:8301-8305)', () => {
    const view = computeOlderPreviewView({
      coins: ['BTC'],
      coinLabels: ['BTC'],
      cutoffDay: '2024-01-01',
      preview: { success: true, would_delete_files: 0, would_delete_size: 0 },
      t,
    });
    expect(view.noteText).toBe('market.noFilesOlder');
    expect(view.canDelete).toBe(false);
  });

  it('formats the files/size line and enables delete (:8308-8310)', () => {
    const view = computeOlderPreviewView({ coins: ['BTC'], coinLabels: ['BTC'], cutoffDay: '2024-01-01', preview, t });
    expect(view.noteText).toBe('market.filesSlashSize:{"files":"3","size":"1.00 MB"}');
    expect(view.canDelete).toBe(true);
  });

  it('falls back to fmtBytes when the server sends no size label (:8309)', () => {
    const view = computeOlderPreviewView({
      coins: ['BTC'],
      coinLabels: ['BTC'],
      cutoffDay: '2024-01-01',
      preview: { success: true, would_delete_files: 2, would_delete_size: 2048 },
      t,
    });
    expect(view.noteText).toBe('market.filesSlashSize:{"files":"2","size":"2.00 KB"}');
  });

  it('counts zero files through Number(x || 0) (:8301)', () => {
    const view = computeOlderPreviewView({
      coins: ['BTC'],
      coinLabels: ['BTC'],
      cutoffDay: '2024-01-01',
      preview: { success: true, would_delete_files: null },
      t,
    });
    expect(view.noteText).toBe('market.noFilesOlder');
  });
});

describe('scope text (:8263-8270)', () => {
  const preview = { success: true, would_delete_files: 1, would_delete_size: 1, would_delete_size_label: '1 B' };

  it('asks to select coins when none are selected', () => {
    const view = computeOlderPreviewView({ coins: [], coinLabels: [], cutoffDay: '2024-01-01', preview, t });
    expect(view.scopeText).toBe('market.selectCoinsInTable');
    expect(view.showSelection).toBe(false);
  });

  it('names the single coin', () => {
    const view = computeOlderPreviewView({ coins: ['XYZ:TSLA'], coinLabels: ['TSLA'], cutoffDay: '2024-01-01', preview, t });
    expect(view.scopeText).toBe('market.deleteOlderForCoin:{"coin":"TSLA"}');
    expect(view.showSelection).toBe(true);
    expect(view.selectionItems).toEqual(['TSLA']);
  });

  it('counts multiple coins', () => {
    const view = computeOlderPreviewView({
      coins: ['BTC', 'ETH'],
      coinLabels: ['BTC', 'ETH'],
      cutoffDay: '2024-01-01',
      preview,
      t,
    });
    expect(view.scopeText).toBe('market.deleteOlderForCoins:{"count":2}');
    expect(view.selectionItems).toEqual(['BTC', 'ETH']);
  });
});
