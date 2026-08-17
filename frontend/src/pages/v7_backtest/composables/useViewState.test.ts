import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { useViewState } from './useViewState';
import { defaultSorts } from '../lib/viewState';

/*
 * Reactive wrapper over the schema-frozen view state
 * (v7_backtest.html:1331-1462): panel switching persists BOTH the
 * localStorage key and the URL hash (:1420-1431), sorts toggle like
 * setSort (:1719-1723) and unknown values never survive a round-trip.
 */

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function makeView(version: 'v7' | 'v8' = 'v7') {
  const storage = new MemoryStorage();
  const urls: string[] = [];
  const view = useViewState({
    version,
    storage: storage as unknown as Storage,
    history: {
      replaceState(url: string): void {
        urls.push(url);
      },
    },
    locationHref: '/api/backtest-v7/main_page?draft_id=abc',
    initial: { panel: 'configs', sorts: defaultSorts() },
  });
  return { view, storage, urls };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/backtest-v7/main_page');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useViewState panel switching (:1434-1462)', () => {
  it('starts on the initial panel and writes storage + hash on switch', async () => {
    const { view, storage, urls } = makeView();
    expect(view.state.panel).toBe('configs');
    view.selectPanel('queue');
    await nextTick();
    const stored = JSON.parse(storage.getItem('pbgui:v7_backtest:view_state')!) as { panel: string };
    expect(stored.panel).toBe('queue');
    expect(urls.at(-1)).toBe('/api/backtest-v7/main_page?draft_id=abc#queue');
  });

  it('persist=false skips both writes (:1449)', async () => {
    const { view, storage, urls } = makeView();
    view.selectPanel('queue');
    view.selectPanel('results', { persist: false });
    await nextTick();
    expect(JSON.parse(storage.getItem('pbgui:v7_backtest:view_state')!).panel).toBe('queue');
    expect(urls.at(-1)).toContain('#queue');
  });

  it('the archive hash encodes name + mode (:1413-1418)', async () => {
    const { view, urls } = makeView();
    view.selectPanel('archive');
    view.openArchive('My Repo', 'optimize');
    await nextTick();
    expect(view.state.panel).toBe('archive');
    expect(view.state.archive).toBe('My Repo');
    expect(view.state.archiveMode).toBe('optimize');
    expect(urls.at(-1)).toBe('/api/backtest-v7/main_page?draft_id=abc#archive:My%20Repo:optimize');
  });

  it('leaving the archive panel keeps the selection but the hash drops it (:1414-1416)', async () => {
    const { view, urls } = makeView();
    view.openArchive('repo', 'schedules');
    view.selectPanel('configs');
    await nextTick();
    expect(view.state.archive).toBe('repo'); // stays for M-v7-11's return-to-archive
    expect(urls.at(-1)).toBe('/api/backtest-v7/main_page?draft_id=abc#configs');
  });
});

describe('useViewState sorts (:1719-1723 setSort)', () => {
  it('clicking a new column sorts ascending', async () => {
    const { view, storage } = makeView();
    view.setSort('configs', 'name');
    await nextTick();
    expect(view.state.sorts.configs).toEqual({ col: 'name', asc: true });
    expect(JSON.parse(storage.getItem('pbgui:v7_backtest:view_state')!).sorts.configs).toEqual({ col: 'name', asc: true });
  });

  it('clicking the same column toggles the direction', async () => {
    const { view } = makeView();
    view.setSort('configs', 'name');
    view.setSort('configs', 'name');
    await nextTick();
    expect(view.state.sorts.configs).toEqual({ col: 'name', asc: false });
  });

  it('an unknown column is ignored (whitelist guard, R2)', async () => {
    const { view } = makeView();
    view.setSort('configs', 'not-a-column');
    await nextTick();
    expect(view.state.sorts.configs.col).toBe('modified');
  });

  it('each table sorts independently', async () => {
    const { view } = makeView();
    view.setSort('results', 'adg');
    view.setSort('archive', 'gain');
    await nextTick();
    expect(view.state.sorts.results).toEqual({ col: 'adg', asc: true });
    expect(view.state.sorts.archive).toEqual({ col: 'gain', asc: true });
    expect(view.state.sorts.configs).toEqual({ col: 'modified', asc: false });
  });
});

describe('useViewState restore (:10012-10023 boot)', () => {
  it('applyViewState seeds panel + sorts from the resolved initial state', async () => {
    const { view } = makeView();
    view.applyViewState({ panel: 'results', archive: 'repo', archiveMode: 'optimize', sorts: defaultSorts() });
    await nextTick();
    expect(view.state.panel).toBe('results');
    expect(view.state.archive).toBe('repo');
    expect(view.state.archiveMode).toBe('optimize');
  });
});

describe('useViewState v8 key', () => {
  it('the storage key is flavor-scoped (:1068)', async () => {
    const { view, storage } = makeView('v8');
    view.selectPanel('results');
    await nextTick();
    expect(storage.getItem('pbgui:v7_backtest:view_state')).toBeNull();
    expect(JSON.parse(storage.getItem('pbgui:v8_backtest:view_state')!).panel).toBe('results');
  });
});
