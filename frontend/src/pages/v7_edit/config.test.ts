import { describe, expect, it } from 'vitest';
import {
  createEditAdapter,
  detectEditFlavor,
  editApiBase,
  readEditPageParams,
  runListUrl,
  type EditAdapter,
} from './config';

/*
 * M-v7-1 foundation — the config module is the port of the injected vars
 * (v7_edit.html:1223-1232) + frontend/js/run_editor_adapter.js (209 L).
 * Both serving routes (/api/v7/edit_page, /api/v8/edit_page) mount the same
 * Vue build; the flavour comes from the route path (recon §4).
 */

describe('detectEditFlavor', () => {
  it('detects v7 from the v7 edit route', () => {
    expect(detectEditFlavor('/api/v7/edit_page')).toBe('v7');
  });

  it('detects v8 from the v8 edit route', () => {
    expect(detectEditFlavor('/api/v8/edit_page')).toBe('v8');
  });

  it('does not confuse other v8 routes with the edit route', () => {
    expect(detectEditFlavor('/api/backtest-v8/main_page')).toBe('v7');
    expect(detectEditFlavor('/api/strategy-explorer-v8/main_page')).toBe('v7');
  });
});

describe('createEditAdapter (run_editor_adapter.js:20-205)', () => {
  const v7 = createEditAdapter('v7');
  const v8 = createEditAdapter('v8');

  it('exposes the version metadata', () => {
    expect(v7.version).toBe('v7');
    expect(v7.isV8).toBe(false);
    expect(v7.label).toBe('PB7');
    expect(v8.version).toBe('v8');
    expect(v8.isV8).toBe(true);
    expect(v8.label).toBe('PB8');
  });

  it('keeps the nav pointing at the run entries (adapter navCurrent, :110)', () => {
    expect(v7.navCurrent).toBe('v7_run');
    expect(v8.navCurrent).toBe('v8_run');
    expect(v7.navSubtitleKey).toBe('editor.run.editNavSubtitle');
  });

  it('flips capabilities per flavour', () => {
    expect(v7.supportsDynamicIgnore).toBe(true);
    expect(v8.supportsDynamicIgnore).toBe(false);
    expect(v7.capabilityKey).toBe('pb7_capable');
    expect(v8.capabilityKey).toBe('pb8_capable');
    expect(v7.backtestPath).toBe('/api/backtest-v7/main_page');
    expect(v8.backtestPath).toBe('/api/backtest-v8/main_page');
  });

  it('flips the seed KNOWN_LIVE_PARAMS list (:116)', () => {
    expect(v7.knownLiveParams).toBeNull();
    expect(v8.knownLiveParams).toEqual(['user', 'approved_coins', 'ignored_coins']);
  });

  describe('bot value accessors (risk.* mapping, :133-139)', () => {
    it('v7 reads and writes bot params at the side-config root', () => {
      const side: Record<string, unknown> = { n_positions: 3 };
      expect(v7.getBotValue(side, 'n_positions', 10)).toBe(3);
      expect(v7.getBotValue(side, 'total_wallet_exposure_limit', 1.7)).toBe(1.7);
      v7.setBotValue(side, 'total_wallet_exposure_limit', 2.5);
      expect(side.total_wallet_exposure_limit).toBe(2.5);
    });

    it('v8 reads and writes bot params under risk.*', () => {
      const side: Record<string, unknown> = { risk: { n_positions: 4 } };
      expect(v8.getBotValue(side, 'n_positions', 10)).toBe(4);
      expect(v8.getBotValue(side, 'total_wallet_exposure_limit', 0)).toBe(0);
      v8.setBotValue(side, 'total_wallet_exposure_limit', 1.2);
      expect((side.risk as Record<string, unknown>).total_wallet_exposure_limit).toBe(1.2);
    });

    it('v8 creates the risk object when missing (risk(), :98-103)', () => {
      const side: Record<string, unknown> = {};
      v8.setBotValue(side, 'n_positions', 7);
      expect((side.risk as Record<string, unknown>).n_positions).toBe(7);
    });
  });

  describe('live value aliasing (:120-132)', () => {
    it('managedLiveValue maps limit_order_create… onto the initial-entry field', () => {
      const values = { initial_entry_exec_max_market_dist_pct: 0.009 };
      expect(v8.managedLiveValue('limit_order_create_max_market_dist_pct', values)).toBe(0.009);
      expect(v8.managedLiveValue('recv_window_ms', { recv_window_ms: 5000 })).toBe(5000);
    });

    it('readLiveValue prefers limit_order_create… on v8', () => {
      const live = {
        initial_entry_exec_max_market_dist_pct: 0.005,
        limit_order_create_max_market_dist_pct: 0.007,
      };
      expect(v8.readLiveValue(live, 'initial_entry_exec_max_market_dist_pct')).toBe(0.007);
      expect(v7.readLiveValue(live, 'initial_entry_exec_max_market_dist_pct')).toBe(0.005);
    });
  });

  it('derives the new-instance name from the live user (:140-142)', () => {
    expect(v7.newInstanceName({ live: { user: '  alice  ' } })).toBe('alice');
    expect(v7.newInstanceName({})).toBe('');
  });

  it('builds the save query/body per flavour (:143-153)', () => {
    expect(v7.saveQuery(true)).toBe('');
    expect(v8.saveQuery(false)).toBe('');
    expect(v8.saveQuery(true)).toBe('?create_only=true');
    expect(v7.saveBody({ a: 1 }, {}, 3)).toEqual({ config: { a: 1 } });
    expect(v8.saveBody({ a: 1 }, null, '4')).toEqual({
      config: { a: 1 },
      override_configs: {},
      expected_version: 4,
    });
    expect(v8.saveBody({ a: 1 }, { files: { BTC: {} } }, 2)).toEqual({
      config: { a: 1 },
      override_configs: { BTC: {} },
      expected_version: 2,
    });
  });
});

describe('readEditPageParams (route query :2494-2497)', () => {
  it('reads the name/new/draft_id vocabulary', () => {
    expect(readEditPageParams('?name=alice')).toEqual({ name: 'alice', isNew: false, draftId: '' });
    expect(readEditPageParams('?new=1')).toEqual({ name: '', isNew: true, draftId: '' });
    expect(readEditPageParams('?draft_id=d-42')).toEqual({ name: '', isNew: false, draftId: 'd-42' });
    expect(readEditPageParams('?name=alice&new=1&draft_id=d-1')).toEqual({
      name: 'alice',
      isNew: true,
      draftId: 'd-1',
    });
  });

  it('treats any non-1 new value as false (legacy new == "1" check)', () => {
    expect(readEditPageParams('?new=true').isNew).toBe(false);
  });

  it('defaults everything empty', () => {
    expect(readEditPageParams('')).toEqual({ name: '', isNew: false, draftId: '' });
  });
});

describe('url builders', () => {
  const adapter: EditAdapter = createEditAdapter('v7');

  it('editApiBase mirrors the injected API_BASE (:1223)', () => {
    expect(editApiBase(adapter, 'http://h:8000')).toBe('http://h:8000/api/v7');
  });

  it('runListUrl is API_BASE + /main_page (goBack :1696)', () => {
    expect(runListUrl('http://h:8000/api/v7')).toBe('http://h:8000/api/v7/main_page');
  });
});
