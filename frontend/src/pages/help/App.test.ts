import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { getBoot } from '@/shared/boot';
import App from './App.vue';

/* Page-shell integration with mocked fetch — the contract the legacy
 * help.html IIFE implemented (index render, topic select, EN/DE switch,
 * toc filter, in-topic + global search, error paths, overlay chrome). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

interface TopicFixture {
  title: string;
  file: string;
  content: string;
}

const TOPICS_EN: TopicFixture[] = [
  { title: 'Overview', file: '00_overview.md', content: '# Welcome\n\nOverview text with pbgui keyword.' },
  { title: 'Coin Data Help', file: '27_coin_data.md', content: '# Coin Data\n\nCoin data topic about symbols and tool usage.' },
  { title: 'DB Tools', file: '41_db_tools.md', content: '# DB Tools\n\nDatabase tools topic text.' },
];

const TOPICS_DE: TopicFixture[] = [
  { title: 'Überblick', file: '00_overview.md', content: '# Willkommen\n\nÜberblick mit pbgui Stichwort.' },
];

const fetchMock = vi.fn();

function installFetch(
  topics: TopicFixture[] = TOPICS_EN,
  opts: { indexStatus?: number; contentStatusByFile?: Record<string, number> } = {},
): void {
  fetchMock.mockImplementation((url: string | URL) => {
    const u = String(url);
    if (u.includes('/api/help/index')) {
      if (opts.indexStatus && opts.indexStatus !== 200) {
        return Promise.resolve(new Response('err', { status: opts.indexStatus }));
      }
      const list = u.includes('lang=DE') ? TOPICS_DE : topics;
      return Promise.resolve(new Response(JSON.stringify(list.map(({ title, file }) => ({ title, file }))), { status: 200 }));
    }
    if (u.includes('/api/help/content')) {
      const file = new URL(u).searchParams.get('file') || '';
      const status = opts.contentStatusByFile?.[file] ?? 200;
      if (status !== 200) return Promise.resolve(new Response('err', { status }));
      const source = u.includes('lang=DE') ? TOPICS_DE : topics;
      const topic = source.find((tp) => tp.file === file);
      return Promise.resolve(new Response(JSON.stringify({ content: topic?.content ?? '' }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
}

/** Local vendor renderer stub: marked wraps the markdown, DOMPurify passes
 * through (the sanitize-before-v-html contract itself is covered in
 * lib/markdown.test.ts). */
function installVendorRenderer(): void {
  window.marked = { parse: (md: string) => `<p>${md}</p>`, setOptions: () => {} };
  window.DOMPurify = { sanitize: (html: string) => html };
}

/** Flush the mount → loadIndex → loadTopic fetch/microtask chain. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Wait out the 260ms search debounce (legacy :979). */
async function waitForDebounce(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 320));
}

let wrapper: VueWrapper | null = null;

async function mountApp(): Promise<VueWrapper> {
  wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  await flush();
  return wrapper;
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/api/help/main_page');
  fetchMock.mockReset();
  installFetch();
  vi.stubGlobal('fetch', fetchMock);
  installVendorRenderer();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  delete window.openHelpOverlay;
  delete window.PBGUI_HELP_OPENER;
  delete window.marked;
  delete window.DOMPurify;
  document.body.classList.remove('pbgui-help-open');
  document.body.innerHTML = '';
});

describe('Help page shell', () => {
  it('opens the overlay on mount, loads the EN index and the first topic', async () => {
    const w = await mountApp();

    expect(w.find('#help-ovl').classes()).toContain('visible');
    expect(w.find('#help-backdrop').classes()).toContain('visible');
    expect(document.body.classList.contains('pbgui-help-open')).toBe(true);
    expect(w.findAll('.toc-item')).toHaveLength(3);
    expect(w.findAll('.toc-item')[0]!.classes()).toContain('active');
    expect(w.find('#help-content').text()).toContain('Overview text');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/help/index?lang=EN'))).toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/help/content?file=00_overview.md&lang=EN'))).toBe(true);
  });

  it('sets the translated document title', async () => {
    await mountApp();
    expect(document.title).toBe('PBGui — Help & Tutorials');
  });

  it('deep-links to the topic matching ?topic= (legacy keyword match :872-883)', async () => {
    window.history.replaceState({}, '', '/api/help/main_page?topic=27_coin_data');
    const w = await mountApp();

    expect(w.findAll('.toc-item')[1]!.classes()).toContain('active');
    expect(w.find('#help-content').text()).toContain('Coin data topic');
  });

  it('loads another topic on toc click and moves the active marker', async () => {
    const w = await mountApp();
    expect(w.findAll('.toc-item')[0]!.classes()).toContain('active');

    await w.findAll('.toc-item')[2]!.trigger('click');
    await flush();

    expect(w.findAll('.toc-item')[2]!.classes()).toContain('active');
    expect(w.find('#help-content').text()).toContain('Database tools topic');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('file=41_db_tools.md'))).toBe(true);
  });

  it('filters the toc list (legacy renderToc filter :817-820)', async () => {
    const w = await mountApp();
    expect(w.findAll('.toc-item')).toHaveLength(3);

    await w.find('#help-toc-filter').setValue('coin');
    await flush();

    const items = w.findAll('.toc-item');
    expect(items).toHaveLength(1);
    expect(items[0]!.text()).toBe('Coin Data Help');
  });

  it('highlights in-topic search matches and shows the n/m count after the debounce', async () => {
    const w = await mountApp();

    await w.find('#help-search').setValue('pbgui');
    await waitForDebounce();

    const marks = w.find('#help-content').findAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.text()).toBe('pbgui');
    expect(marks[0]!.classes()).toContain('current'); // gotoMark(0)
    expect(w.find('#help-search-count').text()).toBe('1/1');
  });

  it('navigates between marks with the up/down buttons and Enter', async () => {
    const w = await mountApp();

    await w.find('#help-search').setValue('o');
    await waitForDebounce();
    const count = w.find('#help-search-count').text();
    expect(count).toMatch(/^1\/\d+$/);

    await w.find('#help-search-dn').trigger('click');
    expect(w.find('#help-search-count').text()).toMatch(/^2\/\d+$/);

    await w.find('#help-search-up').trigger('click');
    expect(w.find('#help-search-count').text()).toMatch(/^1\/\d+$/);

    await w.find('#help-search').trigger('keydown', { key: 'Enter' });
    expect(w.find('#help-search-count').text()).toMatch(/^2\/\d+$/);
  });

  it('clears marks immediately on Escape in the search box', async () => {
    const w = await mountApp();

    await w.find('#help-search').setValue('pbgui');
    await waitForDebounce();
    expect(w.find('#help-content').findAll('mark')).toHaveLength(1);

    await w.find('#help-search').trigger('keydown', { key: 'Escape' });
    await flush();

    expect(w.find('#help-content').findAll('mark')).toHaveLength(0);
    expect(w.find('#help-search-count').text()).toBe('');
  });

  it('renders global-search result cards with highlighted snippets', async () => {
    const w = await mountApp();

    await w.find('#help-search-global').setValue(true);
    await flush();
    expect(w.find('#help-content').text()).toContain('Type a search term'); // legacy :774 empty-term hint

    await w.find('#help-search').setValue('tool');
    await waitForDebounce();

    const items = w.findAll('.gs-item');
    expect(items.length).toBe(2); // coin data + db tools contain 'tool'
    expect(items[0]!.find('.gs-topic').text()).toBe('Coin Data Help');
    expect(items[0]!.find('.gs-snip').html()).toContain('<mark>tool</mark>');
    expect(w.find('#help-search-count').text()).toBe('2 topics');
  });

  it('shows the no-results message for a global search without hits', async () => {
    const w = await mountApp();

    await w.find('#help-search-global').setValue(true);
    await w.find('#help-search').setValue('zzzz');
    await waitForDebounce();

    expect(w.findAll('.gs-item')).toHaveLength(0);
    expect(w.find('#help-content').text()).toContain('No results found.');
    expect(w.find('#help-search-count').text()).toBe('0 found');
  });

  it('opens the clicked global result topic and leaves global mode', async () => {
    const w = await mountApp();

    await w.find('#help-search-global').setValue(true);
    await w.find('#help-search').setValue('database');
    await waitForDebounce();
    expect(w.findAll('.gs-item')).toHaveLength(1);

    await w.findAll('.gs-item')[0]!.trigger('click');
    await flush();

    expect((w.find('#help-search-global').element as HTMLInputElement).checked).toBe(false);
    expect(w.find('#help-content').text()).toContain('Database tools topic');
    expect(w.findAll('.toc-item')[2]!.classes()).toContain('active');
  });

  it('switches to DE, persists the choice and refetches everything with lang=DE', async () => {
    const w = await mountApp();

    await w.find('#help-lang-de').trigger('click');
    await flush();

    expect(w.find('#help-lang-de').classes()).toContain('active');
    expect(window.localStorage.getItem('help-lang')).toBe('DE');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/help/index?lang=DE'))).toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/help/content?file=00_overview.md&lang=DE'))).toBe(true);
    expect(w.find('#help-content').text()).toContain('Überblick');
  });

  it('shows both load failure messages when the index request fails', async () => {
    installFetch(TOPICS_EN, { indexStatus: 500 });
    const w = await mountApp();

    expect(w.find('#help-toc-list').text()).toContain('Failed to load topics.');
    expect(w.find('#help-content').text()).toContain('Failed to load content.');
  });

  it('shows the content failure message when a topic request fails', async () => {
    installFetch(TOPICS_EN, { contentStatusByFile: { '00_overview.md': 500 } });
    const w = await mountApp();

    expect(w.find('#help-content').text()).toContain('Failed to load content.');
  });

  it('shows the empty-topics message for an empty index', async () => {
    installFetch([]);
    const w = await mountApp();

    expect(w.findAll('.toc-item')).toHaveLength(0);
    expect(w.find('#help-content').text()).toContain('No help topics found.');
  });

  it('hides the overlay and body helper class on close', async () => {
    const w = await mountApp();
    expect(w.find('#help-ovl').classes()).toContain('visible');

    await w.find('#help-close').trigger('click');
    await flush();

    expect(w.find('#help-ovl').classes()).not.toContain('visible');
    expect(w.find('#help-backdrop').classes()).not.toContain('visible');
    expect(document.body.classList.contains('pbgui-help-open')).toBe(false);
  });

  it('toggles maximize state and aria-pressed (legacy :898-951)', async () => {
    const w = await mountApp();
    const btn = w.find('#help-maximize');
    expect(btn.attributes('aria-pressed')).toBe('false');

    await btn.trigger('click');
    expect(w.find('#help-ovl').classes()).toContain('is-maximized');
    expect(btn.attributes('aria-pressed')).toBe('true');
    expect(btn.text()).toBe('❐');

    await btn.trigger('click');
    expect(w.find('#help-ovl').classes()).not.toContain('is-maximized');
    expect(btn.attributes('aria-pressed')).toBe('false');
  });

  it('moves the overlay with the drag handle (legacy :1053-1084)', async () => {
    const w = await mountApp();
    const ovl = w.find('#help-ovl').element as HTMLElement;

    await w.find('#help-drag-handle').trigger('mousedown', { clientX: 10, clientY: 10 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 60 }));
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(ovl.style.left).toBe('100px');
    expect(ovl.style.top).toBe('50px');
  });

  it('registers the help opener for the nav Guide button and cleans up on unmount', async () => {
    expect(window.PBGUI_HELP_OPENER).toBeUndefined();
    const w = await mountApp();

    expect(typeof window.PBGUI_HELP_OPENER).toBe('function');
    expect(typeof window.openHelpOverlay).toBe('function');

    w.unmount();
    wrapper = null;
    expect(window.PBGUI_HELP_OPENER).toBeUndefined();
    expect(window.openHelpOverlay).toBeUndefined();
  });
});
