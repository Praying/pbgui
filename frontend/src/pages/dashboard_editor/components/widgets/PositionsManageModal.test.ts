import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { computed, defineComponent, reactive, ref } from 'vue';
import { useManageActions, type ManageFetch } from '../../composables/useManageActions';
import { rowKey, type ManageControlState } from '../../lib/manageLogic';
import type { PositionRow } from '../../types/widgets';
import PositionsConfigPreviewModal from './PositionsConfigPreviewModal.vue';
import PositionsManageModal from './PositionsManageModal.vue';

/*
 * PositionsManageModal — port of openManageModal + renderManageRows +
 * requestManageAction + drag/resize (dashboard_render.js:2261-2451,
 * 2453-2508, 2693-2879, 2881-3198). Dry-run preview and market-close
 * validation are the high-risk paths — asserted against the legacy lines.
 */

enableAutoUnmount(afterEach);

const ROWS: PositionRow[] = [
  {
    user: 'alice', exchange: 'binance', symbol: 'BTCUSDT', side: 'long',
    size: 2, upnl: 12.5, entry: 100, price: 110, dca: 0, next_dca: 90, next_tp: 130, pos_value: 220,
  },
  {
    user: 'bob', exchange: 'binance', symbol: 'ETHUSDT', side: 'short',
    size: 3, upnl: -4, entry: 50, price: 45, dca: 1, next_dca: 40, next_tp: 60, pos_value: 135,
  },
];

interface Env {
  controls: Record<string, ManageControlState>;
  manageFetch: ReturnType<typeof vi.fn<ManageFetch>>;
  /** host-side spies for the modal's close/reload emits */
  close: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  /** the modal child — emitted()/props() reads (structural subset). */
  modal: () => {
    emitted(event?: string): Record<string, unknown[]>;
    props(key: string): unknown;
  };
}

function mountModal(options: {
  rows?: PositionRow[];
  selectedRow?: PositionRow | null;
  closePrice?: unknown;
  manageError?: string | null;
  closePriceFetch?: ReturnType<typeof vi.fn>;
} = {}): { wrapper: ReturnType<typeof mount>; env: Env } {
  const controls = reactive<Record<string, ManageControlState>>({});
  const manageFetch = vi.fn<ManageFetch>();
  if (options.manageError) {
    manageFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ detail: options.manageError }) });
  } else {
    manageFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  }
  const actions = useManageActions({ apiBase: '/api', fetchFn: manageFetch });

  const closePriceFetch = options.closePriceFetch ?? vi.fn();
  if (!options.closePriceFetch) {
    closePriceFetch.mockResolvedValue({ ok: true, status: 200, json: async () => options.closePrice ?? {} });
  }
  vi.stubGlobal('fetch', closePriceFetch);

  const attachTo = document.createElement('div');
  document.body.appendChild(attachTo);
  attached.push(attachTo);

  /* host with v-model wired so selection round-trips like the widget */
  const close = vi.fn();
  const reload = vi.fn();
  const initialRows = options.rows ?? ROWS;
  const host = defineComponent({
    props: { rows: { type: Array, default: () => initialRows } },
    components: { PositionsManageModal },
    setup(p: { rows: PositionRow[] }) {
      const selectedRow = ref<PositionRow | null>(options.selectedRow ?? null);
      const rowsRef = computed(() => p.rows);
      return { rowsRef, selectedRow, controls, actions, close, reload };
    },
    template:
      '<PositionsManageModal :rows="rowsRef" v-model:selected-row="selectedRow" :controls="controls" :actions="actions" api-base="/api" @close="close" @reload="reload" />',
  });
  const wrapper = mount(host, { attachTo });
  return {
    wrapper,
    env: { controls, manageFetch, close, reload, modal: () => wrapper.getComponent(PositionsManageModal) },
  };
}

const attached: HTMLElement[] = [];

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1024);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const el of attached.splice(0)) el.remove();
});

function inputAt(tr: HTMLElement, selector: string): HTMLInputElement {
  return tr.querySelector<HTMLInputElement>(selector)!;
}

function actionTriggerAt(tr: HTMLElement): HTMLElement {
  return tr.querySelector<HTMLElement>('.dp-manage-action')!;
}

/* the action picker is the ui/ listbox now — options render in a body portal.
   Mirrors shared/testing/select.ts, scoped to the teleported modal (the
   wrapper cannot reach it). */
async function openActionSelect(tr: HTMLElement): Promise<HTMLElement[]> {
  await new DOMWrapper(actionTriggerAt(tr)).trigger('keydown', { key: 'Enter' });
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.body.dispatchEvent(new Event('pointerup', { bubbles: true, cancelable: true }));
  await flushPromises();
  const content = document.body.querySelector('[data-slot="select-content"]');
  return content ? Array.from(content.querySelectorAll<HTMLElement>('[role="option"]')) : [];
}

async function pickRowAction(tr: HTMLElement, label: string): Promise<void> {
  const options = await openActionSelect(tr);
  const option = options.find((el) => el.textContent?.trim() === label);
  if (!option) throw new Error(`action option "${label}" not found among ${options.map((el) => el.textContent?.trim())}`);
  await new DOMWrapper(option).trigger('pointerup');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
}

function runBtnAt(tr: HTMLElement): HTMLButtonElement {
  return tr.querySelector<HTMLButtonElement>('.dp-row-run')!;
}

function statusEl(): HTMLElement {
  return document.querySelector<HTMLElement>('#dp-manage-modal .dp-status-msg')!;
}

async function click(el: Element): Promise<void> {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await flushPromises();
}

async function input(el: HTMLInputElement, value: string): Promise<void> {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
}

describe('PositionsManageModal — chrome and rows (render.js:2881-3000)', () => {
  it('renders the teleported modal with the title, note and 16 table headers', async () => {
    const { wrapper } = mountModal();
    await flushPromises();
    expect(document.querySelector('#dp-manage-modal')).not.toBeNull();
    expect(document.querySelector('#dp-manage-modal .dp-modal-title')!.textContent).toBe('Manage positions');
    expect(document.querySelector('#dp-manage-modal .dp-note')!.textContent).toContain('Market close sends');
    const ths = document.querySelectorAll('#dp-manage-modal .dp-manage-table thead th');
    expect(Array.from(ths).map((th) => th.textContent)).toEqual([
      'User', 'Symbol', 'Side', 'Size', 'uPnl', 'Entry', 'Price', 'DCA', 'Next DCA', 'Next TP', 'Pos Value',
      'Action', 'Amount', 'USDT/USDC', 'Quick', 'Execute',
    ]);
    expect(document.body.textContent).toContain('alice');
  });

  it('renders 8 resize handles and the initial centered geometry (render.js:2903-2909, 3163)', async () => {
    mountModal();
    await flushPromises();
    const handles = document.querySelectorAll('#dp-manage-modal .dp-resize-handle');
    expect(Array.from(handles).map((h) => (h as HTMLElement).dataset.dir)).toEqual([
      'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw',
    ]);
    const el = document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal')!;
    const style = el.getAttribute('style') ?? '';
    /* 1024×768 viewport, 2 rows: width 992, height 320, centered */
    expect(style).toContain('width: 992px');
    expect(style).toContain('height: 320px');
    expect(style).toContain('left: 16px');
    expect(style).toContain('top: 224px');
  });

  it('sizes the table wrap by row count (render.js:2263-2265)', async () => {
    mountModal();
    await flushPromises();
    const wrap = document.querySelector<HTMLElement>('#dp-manage-modal .dp-manage-wrap')!;
    expect(wrap.style.maxHeight).toBe('130px'); /* 38 + 2×46 */
  });

  it('shows the empty-state row without positions (render.js:2704-2714)', async () => {
    mountModal({ rows: [] });
    await flushPromises();
    const trs = document.querySelectorAll('#dp-manage-modal .dp-manage-table tbody tr');
    expect(trs[0]!.textContent).toBe('No open positions.');
  });
});

describe('PositionsManageModal — row controls (render.js:2693-2879)', () => {
  it('defaults the action to market_close with amount |size| and the priced quote', async () => {
    const { env } = mountModal();
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    expect(actionTriggerAt(tr).textContent).toBe('Market close amount');
    expect(inputAt(tr, '.dp-manage-amount:not(.dp-manage-quote)').value).toBe('2');
    expect(inputAt(tr, '.dp-manage-quote').value).toBe('220'); /* 2 × 110 */
    expect(runBtnAt(tr).textContent).toBe('Market Close');
    expect(runBtnAt(tr).className).toContain('dp-row-run danger');
    expect(runBtnAt(tr).disabled).toBe(false);
  });

  it('marks the USDC quote placeholder for USDC symbols (render.js:2299-2303, 2792-2793)', async () => {
    mountModal({ rows: [{ ...ROWS[0]!, symbol: 'BTCUSDC' }] });
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    expect(inputAt(tr, '.dp-manage-quote').placeholder).toBe('USDC');
  });

  it('offers the four actions and disables unsupported market closes (render.js:2741-2755)', async () => {
    mountModal({ rows: [{ ...ROWS[0]!, market_close_supported: false, market_close_reason: 'Not verified' }] });
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    const opts = await openActionSelect(tr);
    expect(opts.map((o) => [o.dataset.value, o.textContent?.trim(), o.hasAttribute('data-disabled')])).toEqual([
      ['market_close', 'Market close amount (unavailable)', true],
      ['panic_symbol', 'Panic symbol', false],
      ['graceful_stop_symbol', 'Graceful stop symbol', false],
      ['tp_only_symbol', 'Take profit only symbol', false],
    ]);
    expect(runBtnAt(tr).textContent).toBe('Unavailable');
    expect(runBtnAt(tr).disabled).toBe(true);
    expect(runBtnAt(tr).title).toBe('Not verified');
    expect(inputAt(tr, '.dp-manage-amount:not(.dp-manage-quote)').disabled).toBe(true);
  });

  it('switches the run button per action (render.js:2643-2645)', async () => {
    mountModal();
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    await pickRowAction(tr, 'Panic symbol');
    expect(runBtnAt(tr).textContent).toBe('Panic');
    expect(runBtnAt(tr).className).toContain('dp-row-run danger');
    await pickRowAction(tr, 'Graceful stop symbol');
    expect(runBtnAt(tr).textContent).toBe('Graceful stop');
    expect(runBtnAt(tr).className).toContain('dp-row-run warn');
    await pickRowAction(tr, 'Take profit only symbol');
    expect(runBtnAt(tr).textContent).toBe('Take Profit Only');
    expect(runBtnAt(tr).className).toContain('dp-row-run ok');
  });

  it('applies the 25/50/100% quick buttons to amount and quote (render.js:2816-2831)', async () => {
    mountModal();
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    const quick = tr.querySelectorAll<HTMLButtonElement>('.dp-quick button');
    expect(quick).toHaveLength(3);
    await click(quick[0]!);
    expect(inputAt(tr, '.dp-manage-amount:not(.dp-manage-quote)').value).toBe('0.5');
    expect(inputAt(tr, '.dp-manage-quote').value).toBe('55'); /* 0.5 × 110 */
    await click(quick[2]!);
    expect(inputAt(tr, '.dp-manage-amount:not(.dp-manage-quote)').value).toBe('2');
    expect(inputAt(tr, '.dp-manage-quote').value).toBe('220');
  });

  it('converts typed amounts into the quote (render.js:2775-2782)', async () => {
    mountModal();
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    await input(inputAt(tr, '.dp-manage-amount:not(.dp-manage-quote)'), '1');
    expect(inputAt(tr, '.dp-manage-quote').value).toBe('110');
  });

  it('converts typed quotes into the amount at the close price (render.js:2796-2807)', async () => {
    mountModal();
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    await input(inputAt(tr, '.dp-manage-quote'), '55');
    expect(inputAt(tr, '.dp-manage-amount:not(.dp-manage-quote)').value).toBe('0.5');
    /* the quote field keeps the raw text while typing (legacy never rewrote it) */
    expect(inputAt(tr, '.dp-manage-quote').value).toBe('55');
  });

  it('re-defaults untouched amounts when the row size changes live (render.js:2553-2559)', async () => {
    const { wrapper } = mountModal();
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    await wrapper.setProps({ rows: [{ ...ROWS[0]!, size: 4 }, ROWS[1]!] });
    await flushPromises();
    const tr0 = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    expect(inputAt(tr0, '.dp-manage-amount:not(.dp-manage-quote)').value).toBe('4');
    expect(tr0).toBe(tr); /* same keyed row — no remount */
  });

  it('keeps a typed amount across live row updates (legacy isManageEditing deferral)', async () => {
    const { wrapper } = mountModal();
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    await input(inputAt(tr, '.dp-manage-amount:not(.dp-manage-quote)'), '1.25');
    await wrapper.setProps({ rows: [{ ...ROWS[0]!, upnl: 99 }, ROWS[1]!] });
    await flushPromises();
    const tr0 = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    expect(inputAt(tr0, '.dp-manage-amount:not(.dp-manage-quote)').value).toBe('1.25');
  });

  it('selects the clicked row and emits the selection (render.js:2723-2727)', async () => {
    const { env } = mountModal();
    await flushPromises();
    const trs = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr');
    await click(trs[1]!);
    expect(trs[1]!.className).toContain('dp-sel');
    expect(env.modal().emitted('update:selectedRow')?.[0]).toEqual([ROWS[1]]);
  });
});

describe('PositionsManageModal — market-close validation (render.js:2840-2869)', () => {
  it('rejects unsupported rows with the reason', async () => {
    mountModal({ rows: [{ ...ROWS[0]!, market_close_supported: false, market_close_reason: 'Exchange not verified' }] });
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    await click(runBtnAt(tr));
    expect(statusEl().className).toContain('err');
    expect(statusEl().textContent).toBe('Exchange not verified');
  });

  it('rejects zero and unparsable amounts', async () => {
    mountModal();
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    await input(inputAt(tr, '.dp-manage-amount:not(.dp-manage-quote)'), '0');
    await click(runBtnAt(tr));
    expect(statusEl().textContent).toBe('Enter an amount greater than zero.');
  });

  it('blocks below-minimum amounts before the request (Hyperliquid min value)', async () => {
    mountModal({
      rows: [{ ...ROWS[0]!, exchange: 'hyperliquid' }],
      closePrice: { price: 100, min_cost: 10 },
    });
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    /* the fresh close price drives the quote: 2 × 100 */
    expect(inputAt(tr, '.dp-manage-quote').value).toBe('200');
    await input(inputAt(tr, '.dp-manage-amount:not(.dp-manage-quote)'), '0.05');
    expect(runBtnAt(tr).disabled).toBe(true);
    expect(runBtnAt(tr).title).toBe(
      'Hyperliquid minimum order value is $10. Selected close value is $5; use at least 0.1 amount.'
    );
    await click(runBtnAt(tr));
    expect(statusEl().textContent).toBe(
      'Hyperliquid minimum order value is $10. Selected close value is $5; use at least 0.1 amount.'
    );
  });
});

describe('PositionsManageModal — fresh close price (render.js:2363-2387)', () => {
  it('fetches the close price once per hyperliquid row', async () => {
    const { wrapper } = mountModal({
      rows: [ROWS[0]!, { ...ROWS[1]!, exchange: 'hyperliquid' }],
      closePrice: { price: 42, min_cost: 1 },
    });
    await flushPromises();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      '/api/dashboard/positions/close_price?user=bob&symbol=ETHUSDT&side=short'
    );
    /* the fresh price (42) replaces the row price (45) in the quote */
    const tr1 = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[1]!;
    expect(inputAt(tr1, '.dp-manage-quote').value).toBe('126'); /* 3 × 42 */
    await wrapper.setProps({ rows: [ROWS[0]!, { ...ROWS[1]!, exchange: 'hyperliquid' }] });
    await flushPromises();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1); /* loaded flag sticks */
  });

  it('non-hyperliquid rows never fetch a fresh price', async () => {
    mountModal();
    await flushPromises();
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it('surfaces close-price failures and stops retrying', async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: 'boom' }) });
    mountModal({ rows: [{ ...ROWS[0]!, exchange: 'hyperliquid' }], closePriceFetch: failing });
    await flushPromises();
    expect(statusEl().textContent).toBe('boom');
    /* the loaded flag sticks — no retry on the next rows change */
    expect(failing).toHaveBeenCalledTimes(1);
  });
});

describe('PositionsManageModal — action requests (render.js:2453-2508)', () => {
  it('POSTs the market_close body and reports success (render.js:2479-2480)', async () => {
    vi.useFakeTimers();
    const { env } = mountModal();
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    await click(runBtnAt(tr));
    expect(env.manageFetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(env.manageFetch).mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/dashboard/positions/manage');
    expect(JSON.parse(String(init.body))).toEqual({
      user: 'alice', symbol: 'BTCUSDT', side: 'long', action: 'market_close', amount: 2,
    });
    expect(statusEl().className).toContain('ok');
    expect(statusEl().textContent).toBe('Market close order sent.');
    /* the executed row becomes the selection (render.js:2843) */
    expect(env.modal().emitted('update:selectedRow')?.[0]).toEqual([ROWS[0]]);
    /* onReload fires 600 ms after non-dry-run success (render.js:2494) */
    expect(env.reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it('remembers the precision hint from a failed market close (render.js:2348-2357)', async () => {
    const { env } = mountModal({ manageError: 'minimum amount precision of 0.5 required' });
    await flushPromises();
    const tr = document.querySelectorAll<HTMLElement>('#dp-manage-modal .dp-manage-table tbody tr')[0]!;
    /* a sub-precision amount passes local validation, then the server
       rejects it and the hint blocks it from re-running (render.js:2642) */
    await input(inputAt(tr, '.dp-manage-amount:not(.dp-manage-quote)'), '0.3');
    await click(runBtnAt(tr));
    expect(statusEl().className).toContain('err');
    /* the remembered min amount now blocks the run button (render.js:2642, 2647) */
    expect(runBtnAt(tr).disabled).toBe(true);
    expect(runBtnAt(tr).title).toBe('Exchange minimum close amount is 0.5.');
    expect(env.controls[rowKey(ROWS[0]!)]!.minCloseAmount).toBe(0.5);
  });

  it('opens the config preview for dry-run all-position actions without reloading (render.js:2475-2478)', async () => {
    vi.useFakeTimers();
    const { env } = mountModal();
    env.manageFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, dry_run: true, config: { live: { user: 'alice' } } }),
    });
    await flushPromises();
    const previewBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('#dp-manage-modal .dp-modal-actions button'))
      .find((b) => b.textContent === 'Preview Panic')!;
    await click(previewBtn);
    const init0 = vi.mocked(env.manageFetch).mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init0.body))).toEqual({
      user: 'alice', action: 'panic_all', dry_run: true,
    });
    /* the preview overlay stacks on top with the config JSON (render.js:2394-2451) */
    const preview = document.querySelector('.dp-preview-modal');
    expect(preview).not.toBeNull();
    expect(document.querySelector('.dp-preview-modal .dp-modal-title')!.textContent).toBe(
      'Panic config preview for alice'
    );
    expect(document.querySelector('.dp-preview')!.textContent).toBe(
      JSON.stringify({ live: { user: 'alice' } }, null, 2)
    );
    expect(document.querySelectorAll('.dp-preview-modal .dp-status-msg.ok')[0]!.textContent).toBe(
      'Preview only. No config was saved and no SSH sync was started.'
    );
    expect(statusEl().textContent).toBe('Preview only. No config was saved and no SSH sync was started.');
    await vi.advanceTimersByTimeAsync(1000);
    expect(env.reload).not.toHaveBeenCalled(); /* dry runs never reload */
    /* closing the preview removes it (render.js:2445-2449) */
    const close = Array.from(document.querySelectorAll<HTMLButtonElement>('.dp-preview-modal .dp-modal-actions button'))
      .find((b) => b.textContent === 'Close')!;
    await click(close);
    expect(document.querySelector('.dp-preview-modal')).toBeNull();
  });

  it('runs the all-position actions from the footer with the selected user (render.js:3025-3072)', async () => {
    const { env } = mountModal({ selectedRow: ROWS[1] });
    await flushPromises();
    const panic = Array.from(document.querySelectorAll<HTMLButtonElement>('#dp-manage-modal .dp-modal-actions button'))
      .find((b) => b.textContent === 'Panic')!;
    await click(panic);
    const init0 = vi.mocked(env.manageFetch).mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init0.body))).toEqual({
      user: 'bob', action: 'panic_all',
    });
    expect(statusEl().textContent).toBe('Global panic synced for user bob.');
    expect(env.modal().emitted('update:selectedRow')).toBeUndefined();
  });

  it('footer buttons follow the selection/busy state (render.js:2657-2691)', async () => {
    mountModal({ rows: [] });
    await flushPromises();
    const preview = Array.from(document.querySelectorAll<HTMLButtonElement>('#dp-manage-modal .dp-modal-actions button'))
      .find((b) => b.textContent === 'Preview Panic')!;
    expect(preview.disabled).toBe(true);
    await click(preview);
    expect(statusEl().textContent).toBe('Select a user position first.');
  });

  it('closes from the head and footer close buttons (render.js:3023-3024)', async () => {
    const { env } = mountModal();
    await flushPromises();
    await click(document.querySelector('#dp-manage-modal .dp-modal-close')!);
    expect(env.close).toHaveBeenCalledTimes(1);
    const closeOnly = Array.from(document.querySelectorAll<HTMLButtonElement>('#dp-manage-modal .dp-modal-actions button'))
      .find((b) => b.textContent === 'Close')!;
    await click(closeOnly);
    expect(env.close).toHaveBeenCalledTimes(2);
  });
});

describe('PositionsManageModal — drag and resize (render.js:3074-3182)', () => {
  it('drags the modal from the head within the viewport clamps', async () => {
    mountModal();
    await flushPromises();
    const head = document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal-head')!;
    head.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 300 }));
    await flushPromises();
    const style = document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal')!.getAttribute('style')!;
    expect(style).toContain('left: 416px'); /* 16 + (500-100) */
    expect(style).toContain('top: 424px'); /* 224 + (300-100) */
    /* clamped at innerWidth-80 / innerHeight-48 */
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5000, clientY: 5000 }));
    await flushPromises();
    const style2 = document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal')!.getAttribute('style')!;
    expect(style2).toContain('left: 944px');
    expect(style2).toContain('top: 720px');
    /* the moved flag stops auto-recentering */
    expect(document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal')!.dataset.userMoved).toBe('1');
    document.dispatchEvent(new MouseEvent('mouseup'));
  });

  it('does not drag from the close button (render.js:3078)', async () => {
    mountModal();
    await flushPromises();
    const close = document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal-close')!;
    close.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 400 }));
    await flushPromises();
    const style = document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal')!.getAttribute('style')!;
    expect(style).toContain('left: 16px'); /* unchanged */
  });

  it('resizes from the se handle with viewport clamps', async () => {
    mountModal();
    await flushPromises();
    const handle = document.querySelector<HTMLElement>('.dp-resize-se')!;
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 350 }));
    await flushPromises();
    const style = document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal')!.getAttribute('style')!;
    expect(style).toContain('height: 370px'); /* 320 + 50 */
    /* width clamped to innerWidth - left - 12 = 996 */
    expect(style).toContain('width: 996px');
    expect(document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal')!.dataset.userResized).toBe('1');
    document.dispatchEvent(new MouseEvent('mouseup'));
  });

  it('enforces the 640×280 minimum from the nw handle', async () => {
    mountModal();
    await flushPromises();
    const handle = document.querySelector<HTMLElement>('.dp-resize-nw')!;
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 230 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 3000, clientY: 3000 }));
    await flushPromises();
    const style = document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal')!.getAttribute('style')!;
    expect(style).toContain('width: 640px');
    expect(style).toContain('height: 280px');
    document.dispatchEvent(new MouseEvent('mouseup'));
  });

  it('keeps the user geometry when rows change (render.js:2270-2276)', async () => {
    const { wrapper } = mountModal();
    await flushPromises();
    const handle = document.querySelector<HTMLElement>('.dp-resize-se')!;
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600, clientY: 350 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    await flushPromises();
    const many: PositionRow[] = Array.from({ length: 8 }, (_, i) => ({ ...ROWS[0]!, symbol: 'S' + i + 'USDT' }));
    await wrapper.setProps({ rows: many });
    await flushPromises();
    const style = document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal')!.getAttribute('style')!;
    expect(style).toContain('height: 370px'); /* unchanged — user-resized */
  });

  it('re-fits the dialog height when rows grow without user resize (render.js:2267-2277)', async () => {
    const { wrapper } = mountModal();
    await flushPromises();
    const many: PositionRow[] = Array.from({ length: 8 }, (_, i) => ({ ...ROWS[0]!, symbol: 'S' + i + 'USDT' }));
    await wrapper.setProps({ rows: many });
    await flushPromises();
    const style = document.querySelector<HTMLElement>('#dp-manage-modal .dp-modal')!.getAttribute('style')!;
    expect(style).toContain('height: 596px'); /* min(672, max(280, min(640, 190+406))) */
    expect(document.querySelector<HTMLElement>('#dp-manage-modal .dp-manage-wrap')!.style.maxHeight).toBe('406px');
  });
});

describe('PositionsConfigPreviewModal', () => {
  it('renders the pretty-printed config and closes', async () => {
    const wrapper = mount(PositionsConfigPreviewModal, {
      props: { title: 'T', config: { a: 1 } },
      attachTo: document.createElement('div'),
    });
    await flushPromises();
    expect(document.querySelector('.dp-preview')!.textContent).toBe(JSON.stringify({ a: 1 }, null, 2));
    await click(document.querySelector('.dp-preview-modal .dp-modal-close')!);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('stringifies a null config as {}', async () => {
    mount(PositionsConfigPreviewModal, { props: { title: 'T', config: null } });
    await flushPromises();
    expect(document.querySelector('.dp-preview')!.textContent).toBe('{}');
  });
});
