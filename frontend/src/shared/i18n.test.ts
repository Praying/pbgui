import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n, detectLang, serverMsg } from './i18n';
import en from '../../i18n/en.json';
import zh from '../../i18n/zh.json';
import serverMsgs from '../../i18n/server_msgs.json';

const STORAGE_KEY = 'pbgui-lang';
const KNOWN_SERVER_MSG = 'API Key is required';

describe('i18n bridge', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('translates flat keys via nested conversion', () => {
    const i18n = createI18n('en');
    expect(i18n.global.t('sysmon.settings')).toBe(en['sysmon.settings'] as string);
    i18n.global.locale.value = 'zh';
    expect(i18n.global.t('sysmon.settings')).toBe(zh['sysmon.settings'] as string);
  });

  it('interpolates params', () => {
    const i18n = createI18n('en');
    expect(i18n.global.t('v7backtest.filtersApplied', { approved: 1, ignored: 2 })).toBe(
      'Filters applied: 1 approved, 2 ignored',
    );
  });

  it('renders pipe-containing values verbatim (plural-split escape)', () => {
    const i18n = createI18n('en');
    expect(i18n.global.t('misc.dbtools.filesSummary', { count: 3, size: '4MB' })).toBe(
      '3 files | 4MB',
    );
  });

  it('renders at-containing values verbatim (linked-format escape)', () => {
    const i18n = createI18n('en');
    expect(i18n.global.t('v7explore.marketChip', { exchange: 'binance', coin: 'BTC', price: '1' })).toBe(
      'Market: binance / BTC @ 1',
    );
  });

  it('serverMsg passes through unknown text', () => {
    expect(serverMsg('totally unknown message')).toBe('totally unknown message');
  });

  it('serverMsg passes through when language is en', () => {
    localStorage.setItem(STORAGE_KEY, 'en');
    expect(serverMsg(KNOWN_SERVER_MSG)).toBe(KNOWN_SERVER_MSG);
  });

  it('serverMsg maps known text when language is zh', () => {
    localStorage.setItem(STORAGE_KEY, 'zh');
    expect(serverMsg(KNOWN_SERVER_MSG)).toBe(serverMsgs[KNOWN_SERVER_MSG] as string);
  });

  it('detectLang prefers the stored choice over navigator', () => {
    localStorage.setItem(STORAGE_KEY, 'en');
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    expect(detectLang()).toBe('en');
  });

  it('detectLang falls back to a zh navigator language', () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    expect(detectLang()).toBe('zh');
  });

  it('detectLang defaults to en for a non-zh navigator language', () => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    expect(detectLang()).toBe('en');
  });
});
