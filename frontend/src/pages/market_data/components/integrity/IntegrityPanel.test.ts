import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ConfirmDialog from '../ConfirmDialog.vue';
import IntegrityPanel from './IntegrityPanel.vue';
import { useIntegrity, type IntegrityController } from '../../composables/useIntegrity';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import type { IntegrityPollingController } from '../../composables/useIntegrityPolling';

/* The integrity panel mount — the DOM slice at market_data_main.html
   :3229-3345 (+ gap modal :3595-3636) driven by the useIntegrity store.
   A harness renders the shared ConfirmDialog alongside so destructive
   flows run end-to-end (App wires the same pair). */

const CHECKSUM_SETTINGS = {
  publish_enabled: true,
  publish_archive: 'own',
  reference_archive: 'public',
  archives: [
    { name: 'own', repository: 'me/pbgui', can_publish: true, can_reference: false },
    { name: 'public', repository: 'org/public', can_publish: false, can_reference: true },
  ],
  catalog: { initial_scan_complete: true, counts: { valid: 10, inception_partial: 2, source_gap: 3, invalid: 4 } },
  reference: { selected_repository: 'org/public', matches_selected: true },
};

const INTEGRITY_STATUS = {
  catalog: CHECKSUM_SETTINGS.catalog,
  comparison: {
    counts: { local_only: 1, reference_only: 2, mismatch: 3 },
    differences: [{ kind: 'mismatch', exchange: 'bybit', coin: 'BTC', day: '2026-01-02' }],
  },
  reference: CHECKSUM_SETTINGS.reference,
};

const REMOVED_COINS = {
  rows: [
    { exchange: 'bybit', coin: 'OLD1', files: 2, bytes: 1024, from_day: '2024-01-01', to_day: '2024-02-01', market_reason: 'delisted', removable: true },
    { exchange: 'bybit', coin: 'OLD2', files: 1, bytes: 512, from_day: '2024-03-01', to_day: '2024-03-02', market_reason: 'inactive', removable: false },
  ],
  mapping_status: 'ok',
  mapping_reason: '',
};

const REMOVED_PREVIEW = {
  coin_count: 1,
  files: 2,
  bytes: 1024,
  from_day: '2024-01-01',
  to_day: '2024-02-01',
  blocked_count: 0,
  coins: ['OLD1'],
};

const ISSUES = {
  rows: [
    { exchange: 'bybit', coin: 'BTC', day: '2026-01-05', missing_minutes: 10, error: 'checksum mismatch' },
    { exchange: 'bybit', coin: 'BTC', day: '2026-01-02', missing_minutes: 30, error: 'checksum mismatch' },
  ],
};

const T_TABLE: Record<string, string> = {
  'market.removedCount': '{count} removed markets',
  'market.issueCount': '{coins} coins / {days} damaged days',
  'market.differenceCount': '{count} differences',
  'market.removeSelectedCount': 'Remove selected ({count})',
  'market.removeSelected': 'Remove selected',
  'market.removeUnavailableMessage': 'Remove {count} unavailable market(s)?',
  'market.filesAndSize': '{files} files, {size}',
};

function harnessT(key: string, params?: Record<string, unknown>): string {
  let out = T_TABLE[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.replaceAll(`{${name}}`, String(value));
    }
  }
  return out;
}

const DAY_DETAILS = {
  day: '2026-01-05',
  actual_candles: 1400,
  missing_minutes: 40,
  damaged_missing_minutes: 12,
  first: '2026-01-05T00:05:00',
  last: '2026-01-05T23:59:00',
  error: 'checksum mismatch',
  earliest_local_day: '2024-01-01',
  day_context: [{ day: '2026-01-04', hourly_coverage: 'pxxxxxxxxxxxxxxxxxxxxxxx', candles: 720, status: 'ok' }],
  coverage: 'p'.repeat(700) + 'i'.repeat(60) + 'p'.repeat(680),
  ranges: [{ kind: 'internal', start: '2026-01-05T01:00:00', end: '2026-01-05T01:10:00', minutes: 10 }],
};

let fetchMock: ReturnType<typeof vi.fn>;
const showToast = vi.fn();
let mountedWrapper: ReturnType<typeof mount> | null = null;

function setupFetch(): void {
  fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (path === '/checksums/settings' && method === 'GET') return new Response(JSON.stringify(CHECKSUM_SETTINGS));
    if (path === '/checksums/settings') return new Response(JSON.stringify({ success: true, settings: CHECKSUM_SETTINGS }));
    if (path === '/integrity/removed-coins/preview') return new Response(JSON.stringify(REMOVED_PREVIEW));
    if (path.startsWith('/integrity/status')) return new Response(JSON.stringify(INTEGRITY_STATUS));
    if (path.startsWith('/integrity/removed-coins?')) return new Response(JSON.stringify(REMOVED_COINS));
    if (path.startsWith('/integrity/issues')) return new Response(JSON.stringify(ISSUES));
    if (path.startsWith('/integrity/day-details')) return new Response(JSON.stringify(DAY_DETAILS));
    if (method === 'POST') return new Response(JSON.stringify({ created: true }));
    return new Response('{}');
  });
}

interface HarnessExposed {
  store: IntegrityController;
}

/** IntegrityPanel + ConfirmDialog exactly as App composes them. */
function makeHarness(active = true) {
  let exposed: HarnessExposed | null = null;
  const Harness = defineComponent({
    props: { active: { type: Boolean, default: true } },
    setup(props) {
      const dialog = useConfirmDialog({ t: harnessT });
      const polling: IntegrityPollingController = {
        start: vi.fn(),
        stop: vi.fn(),
        isPolling: () => false,
        hadActiveJob: () => false,
        markActiveJob: vi.fn(),
      };
      const store = useIntegrity({
        api: {
          fetchJson: <T>(path: string, init?: RequestInit): Promise<T> =>
            fetchMock(path, init).then((response: Response) => response.json() as Promise<T>),
        },
        t: harnessT,
        showToast,
        confirm: dialog.confirm,
        getExchange: () => 'bybit',
        serial: () => 'S1',
        polling,
        now: () => 1111,
      });
      exposed = { store };
      // App's panel onEnter (:9066-9067) — the harness runs the same load
      void store.loadIntegrityPanel(false);
      return () => [
        h(IntegrityPanel, { store, polling, active: props.active }),
        h(ConfirmDialog, { dialog }),
      ];
    },
  });
  return { Harness, getStore: () => (exposed as HarnessExposed | null)?.store ?? null };
}

async function mountPanel(active = true) {
  const { Harness, getStore } = makeHarness(active);
  const wrapper = mount(Harness, {
    props: { active },
    global: { plugins: [createI18n('en')] },
    attachTo: document.body,
  });
  mountedWrapper = wrapper;
  await flush();
  return { wrapper, store: getStore() };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function calls(): Array<{ path: string; method: string; body?: string }> {
  return fetchMock.mock.calls.map(([path, init]) => ({
    path: String(path),
    method: (init as RequestInit | undefined)?.method ?? 'GET',
    body: (init as RequestInit | undefined)?.body ? String((init as RequestInit).body) : undefined,
  }));
}

beforeEach(() => {
  setupFetch();
  document.body.innerHTML = '';
  window.localStorage.clear();
});

afterEach(() => {
  // unmount removes the document keydown/mouseup listeners (the panel and
  // the confirm overlay both install them) — a leaked listener from a
  // previous test would answer later document events with a stale store
  mountedWrapper?.unmount();
  mountedWrapper = null;
  document.body.innerHTML = '';
});

describe('integrity panel render (:3229-3345)', () => {
  it('renders the summary cards, tables and job monitor from the payload', async () => {
    const { wrapper } = await mountPanel();
    expect(wrapper.findAll('#integrity-summary .summary-card')).toHaveLength(5);
    expect(wrapper.find('#integrity-feedback').exists()).toBe(false); // no message → not rendered
    // removed markets
    const removedRows = wrapper.findAll('#integrity-removed-coins tr');
    expect(removedRows).toHaveLength(2);
    const removable = wrapper.find('[data-integrity-removed-row]');
    expect(removable.attributes('data-coin')).toBe('OLD1');
    expect(removable.attributes('aria-selected')).toBe('false');
    expect(wrapper.find('[data-integrity-remove-coin="1"][data-coin="OLD1"]').exists()).toBe(true);
    expect(wrapper.find('#integrity-removed-count').text()).toBe('2 removed markets');
    expect(wrapper.find('#btn-integrity-remove-all').attributes('disabled')).toBeUndefined();
    // repair queue
    expect(wrapper.find('#integrity-issue-count').text()).toBe('1 coins / 2 damaged days');
    expect(wrapper.find('#btn-integrity-repair-all').attributes('disabled')).toBeUndefined();
    expect(wrapper.findAll('#integrity-issues tr')).toHaveLength(1);
    // differences
    expect(wrapper.find('#integrity-difference-count').text()).toBe('6 differences');
    expect(wrapper.findAll('#integrity-differences tr')).toHaveLength(1);
    // job monitor iframe
    const frame = wrapper.find('#integrity-job-monitor-frame');
    expect(frame.exists()).toBe(true);
    expect(frame.attributes('src')).toContain('/app/jobs_monitor.html?v=S1&embed=1&exchange=bybit&job_type=');
  });

  it('hides the normalize button off hyperliquid (:4309)', async () => {
    const { wrapper } = await mountPanel();
    expect(wrapper.find('#btn-integrity-normalize-hl').exists()).toBe(false);
  });

  it('renders the archive form with predicate-filtered options (:3276-3295)', async () => {
    const { wrapper } = await mountPanel();
    const publish = wrapper.find('#integrity-publish-archive');
    expect(publish.findAll('option').map((o) => o.attributes('value'))).toEqual(['', 'own']);
    expect((publish.element as HTMLSelectElement).value).toBe('own');
    const reference = wrapper.find('#integrity-reference-archive');
    expect(reference.findAll('option').map((o) => o.attributes('value'))).toEqual(['', 'public']);
    expect((wrapper.find('#integrity-publish-enabled').element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.find('#btn-integrity-publish').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('#btn-integrity-reference').attributes('disabled')).toBeUndefined();
  });

  it('shows the loading feedback while fetching (:4530)', async () => {
    let release: (body: string) => void = () => undefined;
    fetchMock = vi.fn(
      (path: string) =>
        new Promise<Response>((resolve) => {
          if (String(path) === '/checksums/settings') {
            release = (body) => resolve(new Response(body));
            return undefined as unknown as void;
          }
          resolve(new Response('{}'));
          return undefined as unknown as void;
        })
    );
    const { wrapper } = await mountPanel();
    const feedback = wrapper.find('#integrity-feedback');
    expect(feedback.exists()).toBe(true);
    release(JSON.stringify(CHECKSUM_SETTINGS));
    await flush();
  });
});

describe('integrity panel actions (:9140-9283)', () => {
  it('queues a full scan on the button click (:9140-9143)', async () => {
    const { wrapper } = await mountPanel();
    await wrapper.find('#btn-integrity-scan').trigger('click');
    await flush();
    const post = calls().find((c) => c.method === 'POST');
    expect(post?.path).toBe('/integrity/scan');
    expect(JSON.parse(post?.body ?? '{}')).toEqual({ exchange: 'bybit' });
  });

  it('PUTs the archive settings on save (:9169-9171)', async () => {
    const { wrapper } = await mountPanel();
    await wrapper.find('#integrity-publish-enabled').setValue(false);
    await wrapper.find('#btn-integrity-save').trigger('click');
    await flush();
    const put = calls().find((c) => c.method === 'PUT');
    expect(JSON.parse(put?.body ?? '{}')).toEqual({
      publish_enabled: false,
      publish_archive: 'own',
      reference_archive: 'public',
    });
  });

  it('opens the gap modal from the Details button and loads the day (:9178-9186)', async () => {
    const { wrapper } = await mountPanel();
    await wrapper.find('[data-integrity-gap-details]').trigger('click');
    await flush();
    const modal = wrapper.find('#integrity-gap-modal');
    expect(modal.exists()).toBe(true);
    expect(wrapper.find('#integrity-gap-subtitle').text()).toBe('bybit / BTC');
    expect(document.activeElement?.id).toBe('btn-integrity-gap-close'); // :4802
    expect(calls().some((c) => c.path.startsWith('/integrity/day-details?exchange=bybit&coin=BTC&day=2026-01-05'))).toBe(true);
    // chart + ranges rendered
    expect(wrapper.findAll('#integrity-gap-chart .integrity-gap-hour')).toHaveLength(24);
    expect(wrapper.find('#integrity-gap-chart .integrity-gap-hour .integrity-gap-cell.internal').exists()).toBe(true);
    expect(wrapper.findAll('#integrity-gap-ranges tr')).toHaveLength(1);
    // day context buttons with hourly markers (:4675-4704)
    const dayButton = wrapper.find('[data-integrity-context-day="2026-01-04"]');
    expect(dayButton.exists()).toBe(true);
    expect(dayButton.findAll('.integrity-context-hour')).toHaveLength(24);
    expect(dayButton.find('.integrity-context-hour.partial').exists()).toBe(true);
    await wrapper.find('#btn-integrity-gap-close').trigger('click');
    expect(wrapper.find('#integrity-gap-modal').exists()).toBe(false);
  });

  it('loads another day from the modal select (:9200-9202)', async () => {
    const { wrapper } = await mountPanel();
    await wrapper.find('[data-integrity-gap-details]').trigger('click');
    await flush();
    await wrapper.find('#integrity-gap-day').setValue('2026-01-02');
    await flush();
    expect(
      calls().some((c) => c.path.endsWith('/integrity/day-details?exchange=bybit&coin=BTC&day=2026-01-02'))
    ).toBe(true);
  });

  it('selects a removed row and removes it through the confirm dialog (:9260-9266, :4861-4868)', async () => {
    const { wrapper } = await mountPanel();
    const row = wrapper.find('[data-integrity-removed-row]');
    await row.trigger('mousedown'); // legacy selection press (:9217-9226)
    document.dispatchEvent(new MouseEvent('mouseup')); // :9248-9254 toggle
    await nextTick();
    expect(row.attributes('aria-selected')).toBe('true');
    expect(wrapper.find('#btn-integrity-remove-selected').text()).toBe('Remove selected (1)');
    await wrapper.find('#btn-integrity-remove-selected').trigger('click');
    await flush();
    // confirm overlay rendered with the preview payload (:4861-4868)
    const overlay = wrapper.find('#confirm-ovl');
    expect(overlay.classes()).toContain('visible');
    expect(wrapper.find('#confirm-message').text()).toBe('Remove 1 unavailable market(s)?');
    expect(wrapper.find('#confirm-detail').text()).toContain('2 files, 1.00 KB');
    expect(wrapper.find('#confirm-list-item, .confirm-list-item').exists()).toBe(true);
    await wrapper.find('#btn-confirm-cancel').trigger('click');
    await flush();
    expect(calls().find((c) => c.path === '/integrity/removed-coins/remove')).toBeUndefined();
    // accept path
    await wrapper.find('#btn-integrity-remove-selected').trigger('click');
    await flush();
    await wrapper.find('#btn-confirm-accept').trigger('click');
    await flush();
    expect(
      JSON.parse(calls().find((c) => c.path === '/integrity/removed-coins/remove')?.body ?? '{}')
    ).toEqual({ exchange: 'bybit', coins: ['OLD1'] });
  });

  it('removes every removable market on remove-all (:9267-9269)', async () => {
    const { wrapper } = await mountPanel();
    await wrapper.find('#btn-integrity-remove-all').trigger('click');
    await flush();
    await wrapper.find('#btn-confirm-accept').trigger('click');
    await flush();
    expect(
      JSON.parse(calls().find((c) => c.path === '/integrity/removed-coins/remove')?.body ?? '{}')
    ).toEqual({ exchange: 'bybit', all: true });
  });

  it('routes the Delete key through removal while the panel is active (:9270-9283)', async () => {
    const { wrapper } = await mountPanel();
    await wrapper.find('[data-integrity-removed-row]').trigger('mousedown');
    document.dispatchEvent(new MouseEvent('mouseup'));
    await nextTick();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await flush();
    await wrapper.find('#btn-confirm-accept').trigger('click');
    await flush();
    expect(
      JSON.parse(calls().find((c) => c.path === '/integrity/removed-coins/remove')?.body ?? '{}')
    ).toEqual({ exchange: 'bybit', coins: ['OLD1'] });
  });

  it('ignores the Delete key while another panel is active (:9275-9276)', async () => {
    const { wrapper } = await mountPanel(false);
    await wrapper.find('[data-integrity-removed-row]').trigger('mousedown');
    document.dispatchEvent(new MouseEvent('mouseup'));
    await nextTick();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await flush();
    expect(calls().find((c) => c.method === 'POST')).toBeUndefined();
  });

  it('removes a single coin from its row button (:9208-9216)', async () => {
    const { wrapper } = await mountPanel();
    await wrapper.find('[data-integrity-remove-coin]').trigger('click');
    await flush();
    await wrapper.find('#btn-confirm-accept').trigger('click');
    await flush();
    expect(
      JSON.parse(calls().find((c) => c.path === '/integrity/removed-coins/remove')?.body ?? '{}')
    ).toEqual({ exchange: 'bybit', coins: ['OLD1'] });
  });
});
