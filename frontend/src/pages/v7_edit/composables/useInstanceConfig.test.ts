import { describe, expect, it, vi } from 'vitest';
import {
  buildDefaultConfig,
  fetchTemplateConfig,
  loadUsers,
  loadInstanceConfig,
  normalizeEditorConfigPayload,
} from './useInstanceConfig';
import { createEditAdapter } from '../config';

/*
 * Draft/new/edit load modes — ports of init (:1834-1890),
 * fetchTemplateConfig (:1987-2005), buildDefaultConfig (:2007-2069) and
 * editor_shared.js normalizeEditorConfigPayload (:566-607) which the draft
 * path routes through (legacy file is the spec).
 */

const V7 = createEditAdapter('v7');
const V8 = createEditAdapter('v8');

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 500, statusText: ok ? 'OK' : 'Boom' });
}

describe('normalizeEditorConfigPayload (editor_shared.js:566-607)', () => {
  it('unwraps the wrapped config and param_status', () => {
    const payload = normalizeEditorConfigPayload({
      config: { live: { user: 'a' } },
      param_status: { long: { neat: 'pb_default' } },
    });
    expect(payload.config).toEqual({ live: { user: 'a' } });
    expect(payload.param_status).toEqual({ long: { neat: 'pb_default' } });
    expect(payload.name).toBe('');
  });

  it('preserves migration review metadata from a PB8 draft', () => {
    const payload = normalizeEditorConfigPayload({
      config: { live: {} },
      migration_report: { manual_review_fields: ['bot.long.example'] },
      migration_review_values: { 'bot.long.example': 1 },
      migration_message: 'Migration requires manual review',
    });
    expect(payload.migration_report).toEqual({ manual_review_fields: ['bot.long.example'] });
    expect(payload.migration_review_values).toEqual({ 'bot.long.example': 1 });
    expect(payload.migration_message).toBe('Migration requires manual review');
  });

  it('falls back to the _pbgui_param_status annotations and strips them', () => {
    const payload = normalizeEditorConfigPayload({
      config: { live: {}, _pbgui_param_status: { long: { neat: 'neutralized' } } },
    });
    expect(payload.param_status).toEqual({ long: { neat: 'neutralized' } });
    expect('_pbgui_param_status' in payload.config).toBe(false);
  });

  it('accepts bare configs', () => {
    const payload = normalizeEditorConfigPayload({ live: { user: 'x' } });
    expect(payload.config).toEqual({ live: { user: 'x' } });
    expect(payload.param_status).toEqual({});
  });

  it('uses the fallback config for invalid payloads', () => {
    const payload = normalizeEditorConfigPayload(null, { live: {} });
    expect(payload.config).toEqual({ live: {} });
    expect(payload.name).toBe('');
  });

  it('throws for invalid payloads without a fallback', () => {
    expect(() => normalizeEditorConfigPayload('nope')).toThrow('Invalid editor config payload');
  });
});

describe('loadUsers', () => {
  it('reads the users list', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ users: [{ name: 'a', exchange: 'binance' }] }));
    const users = await loadUsers('http://x/api/v7', fetchFn as unknown as typeof fetch);
    expect(users).toEqual([{ name: 'a', exchange: 'binance' }]);
    expect(fetchFn).toHaveBeenCalledWith('http://x/api/v7/users', expect.anything());
  });

  it('defaults to an empty list when the server omits users', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}));
    const users = await loadUsers('http://x/api/v7', fetchFn as unknown as typeof fetch);
    expect(users).toEqual([]);
  });
});

describe('buildDefaultConfig (:2007-2069)', () => {
  it('seeds the v7 default shape', () => {
    const cfg = buildDefaultConfig('alice');
    expect(cfg.live).toMatchObject({
      user: 'alice',
      leverage: 10,
      approved_coins: { long: [], short: [] },
      hsl_signal_mode: 'unified',
      max_ohlcv_fetches_per_minute: 24,
    });
    expect(cfg.pbgui).toMatchObject({ version: 0, enabled_on: 'disabled', vol_mcap: 10.0 });
    expect(cfg.bot).toEqual({
      long: { n_positions: 10, total_wallet_exposure_limit: 1.7 },
      short: { n_positions: 0, total_wallet_exposure_limit: 0 },
    });
    expect(cfg.coin_overrides).toEqual({});
  });
});

describe('fetchTemplateConfig (:1987-2005)', () => {
  it('uses the server template and overrides the user', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ config: { live: { user: 'template' } } }));
    const cfg = await fetchTemplateConfig('http://x/api/v7', V7, 'bob', fetchFn as unknown as typeof fetch);
    expect((cfg.live as Record<string, string>).user).toBe('bob');
    expect(cfg.pbgui).toEqual({});
  });

  it('falls back to the built-in defaults for v7 when the endpoint fails', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    const cfg = await fetchTemplateConfig('http://x/api/v7', V7, 'carol', fetchFn as unknown as typeof fetch);
    expect((cfg.live as Record<string, string>).user).toBe('carol');
    expect((cfg.live as Record<string, number>).leverage).toBe(10);
  });

  it('rethrows for v8 (no built-in fallback, :2000-2004)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(fetchTemplateConfig('http://x/api/v8', V8, 'dave', fetchFn)).rejects.toThrow('offline');
  });

  it('throws the PB8 template message when the endpoint answers non-ok', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ detail: 'no template' }, false));
    await expect(fetchTemplateConfig('http://x/api/v8', V8, 'dave', fetchFn)).rejects.toThrow();
  });
});

describe('loadInstanceConfig (init :1834-1890)', () => {
  const EMPTY_PARAMS = { name: '', isNew: false, draftId: '' };

  it('prefers the draft payload when draft_id is present', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/draft/d-1'))
        return jsonResponse({
          config: { live: { user: 'from-draft' }, pbgui: { from_backtest_config: '/tmp/x.json' } },
          param_status: { long: { neat: 'pb_default' } },
          override_configs: { BTC: {} },
        });
      throw new Error('unexpected fetch ' + url);
    });
    const result = await loadInstanceConfig('http://x/api/v7', V7, { ...EMPTY_PARAMS, draftId: 'd-1' }, fetchFn as unknown as typeof fetch);
    expect(result.source).toBe('draft');
    expect((result.cfg.live as Record<string, string>).user).toBe('from-draft');
    expect(result.paramStatus).toEqual({ long: { neat: 'pb_default' } });
    expect(result.fromBacktestConfig).toBe('/tmp/x.json');
    // legacy: the draft normalizer drops override_configs (loaded on demand)
    expect(result.overrideConfigs).toEqual({});
  });

  it('surfaces the backup-draft warning (from_backup_config toast :1861)', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        config: { pbgui: { from_backup_config: { name: 'bk', timestamp: '2026-08-18T10:00:00Z' } } },
      })
    );
    const result = await loadInstanceConfig('http://x/api/v7', V7, { ...EMPTY_PARAMS, draftId: 'd-2' }, fetchFn as unknown as typeof fetch);
    expect(result.warnings).toEqual([{ kind: 'backup-loaded', name: 'bk', timestamp: '2026-08-18T10:00:00Z' }]);
  });

  it('falls through to the new-template mode when the draft is missing', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/draft/missing')) return jsonResponse({ detail: 'expired' }, false);
      if (url.includes('/instances/new-config')) return jsonResponse({ config: { live: {} } });
      throw new Error('unexpected fetch ' + url);
    });
    const result = await loadInstanceConfig(
      'http://x/api/v7',
      V7,
      { name: '', isNew: true, draftId: 'missing' },
      fetchFn as unknown as typeof fetch
    );
    expect(result.source).toBe('new');
    expect(result.warnings).toEqual([{ kind: 'draft-not-found' }]);
    expect((result.cfg.live as Record<string, string>).user).toBe('');
  });

  it('new mode without a draft fetches the template for the first user', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/instances/new-config')) return jsonResponse({ config: { live: {} } });
      throw new Error('unexpected fetch ' + url);
    });
    const result = await loadInstanceConfig(
      'http://x/api/v7',
      V7,
      { name: '', isNew: true, draftId: '' },
      fetchFn as unknown as typeof fetch,
      [{ name: 'first-user', exchange: 'binance' }]
    );
    expect(result.source).toBe('new');
    expect((result.cfg.live as Record<string, string>).user).toBe('first-user');
  });

  it('loads the named instance config with override_configs preserved', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/instances/alice/config'))
        return jsonResponse({
          config: { live: { user: 'alice' } },
          param_status: {},
          override_configs: { BTC: { long: {} } },
        });
      throw new Error('unexpected fetch ' + url);
    });
    const result = await loadInstanceConfig(
      'http://x/api/v7',
      V7,
      { name: 'alice', isNew: false, draftId: '' },
      fetchFn as unknown as typeof fetch
    );
    expect(result.source).toBe('instance');
    expect(result.overrideConfigs).toEqual({ BTC: { long: {} } });
    expect(fetchFn).toHaveBeenCalledWith(
      'http://x/api/v7/instances/alice/config',
      expect.objectContaining({ credentials: 'same-origin' })
    );
  });

  it('propagates load failures for the named-instance mode', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ detail: 'no such instance' }, false));
    await expect(
      loadInstanceConfig('http://x/api/v7', V7, { name: 'ghost', isNew: false, draftId: '' }, fetchFn as unknown as typeof fetch)
    ).rejects.toThrow();
  });
});
