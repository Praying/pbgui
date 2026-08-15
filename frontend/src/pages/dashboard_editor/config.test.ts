import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readEditorConfig, wsDashboardUrl } from './config';

/* Port of the editor's injected config (dashboard_editor.html:493-497) and
   the WS URL derivation (editor:2788-2791). The Vue page reads the same
   query params the legacy route used for %%API_BASE%% / %%DASHBOARD_NAME%% /
   %%VIEW_ONLY%% / %%STANDALONE%%; dashboard_main builds those URLs with
   URLSearchParams (dashboard_main/config.ts:26-29). */

const BOOT = { origin: 'http://pbgui.test:8000', token: 'tok', version: '1.0.0', serial: 'S1' };

beforeEach(() => {
  (globalThis as { __BOOT__?: unknown }).__BOOT__ = BOOT;
});

afterEach(() => {
  delete (globalThis as { __BOOT__?: unknown }).__BOOT__;
});

describe('readEditorConfig', () => {
  it('parses the standalone editor URL built by dashboard_main', () => {
    const cfg = readEditorConfig(
      '?name=Draft&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi&standalone=1'
    );
    expect(cfg).toEqual({
      apiBase: 'http://pbgui.test:8000/api',
      origName: 'Draft',
      viewOnly: false,
      standalone: true,
    });
  });

  it('parses the view-only URL built by dashboard_main', () => {
    const cfg = readEditorConfig('?name=B&api_base=http%3A%2F%2Fpbgui.test%3A8000%2Fapi&view_only=1');
    expect(cfg).toEqual({
      apiBase: 'http://pbgui.test:8000/api',
      origName: 'B',
      viewOnly: true,
      standalone: false,
    });
  });

  it('treats view_only=0 / standalone=0 as off (legacy "1" else "0")', () => {
    const cfg = readEditorConfig('?name=A&api_base=%2Fapi&view_only=0&standalone=0');
    expect(cfg.viewOnly).toBe(false);
    expect(cfg.standalone).toBe(false);
  });

  it('defaults name to empty and flags to off without params', () => {
    const cfg = readEditorConfig('');
    expect(cfg.origName).toBe('');
    expect(cfg.viewOnly).toBe(false);
    expect(cfg.standalone).toBe(false);
  });

  it('falls back to the boot origin + /api when api_base is missing', () => {
    const cfg = readEditorConfig('?name=A');
    expect(cfg.apiBase).toBe('http://pbgui.test:8000/api');
  });

  it('keeps an explicitly empty api_base as boot-derived (legacy empty → relative; same-origin equivalence)', () => {
    const cfg = readEditorConfig('?name=A&api_base=');
    expect(cfg.apiBase).toBe('http://pbgui.test:8000/api');
  });

  it('treats view_only=1 only when the exact literal "1" is passed', () => {
    expect(readEditorConfig('?view_only=true').viewOnly).toBe(false);
    expect(readEditorConfig('?view_only=1').viewOnly).toBe(true);
  });

  it('decodes a name containing unicode and special characters', () => {
    const cfg = readEditorConfig('?name=' + encodeURIComponent('我的 📊 Dash'));
    expect(cfg.origName).toBe('我的 📊 Dash');
  });
});

describe('wsDashboardUrl (editor:2788-2791)', () => {
  it('rewrites http:// + /api to ws:// + /ws/dashboard', () => {
    expect(wsDashboardUrl('http://pbgui.test:8000/api')).toBe('ws://pbgui.test:8000/ws/dashboard');
  });

  it('rewrites https:// to wss://', () => {
    expect(wsDashboardUrl('https://pbgui.test/api')).toBe('wss://pbgui.test/ws/dashboard');
  });

  it('handles a relative api base like the legacy empty API_BASE', () => {
    expect(wsDashboardUrl('/api')).toBe('/ws/dashboard');
    expect(wsDashboardUrl('')).toBe('/ws/dashboard');
  });

  it('only strips a trailing /api (legacy replace anchor)', () => {
    expect(wsDashboardUrl('http://h/api/v2/api')).toBe('ws://h/api/v2/ws/dashboard');
  });
});
