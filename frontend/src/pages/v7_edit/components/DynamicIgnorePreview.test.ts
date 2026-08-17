import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { createI18n } from '@/shared/i18n';
import DynamicIgnorePreview from './DynamicIgnorePreview.vue';
import { EDIT_PAGE_KEY, type UseEditPage } from '../composables/useEditPage';
import { createEmptyFormState } from '../lib/formModel';

/*
 * The dynamic-ignore preview refresh policy (v7_edit.html): the checkbox
 * flip refreshes immediately (updateDynamicIgnorePreview :3386-3391) while
 * filter/tag changes go through the 600 ms debounce
 * (_scheduleIgnoreRefresh :3427-3446) — one /coins/filter per burst of
 * typing, not one per keystroke.
 */

const fetchMock = vi.fn();

function mountPreview() {
  const state = reactive(createEmptyFormState());
  const page = {
    state,
    selectedUserExchange: () => 'binance',
    apiBaseOf: () => 'http://pbgui.test:8000/api/v7',
  } as unknown as UseEditPage;
  const wrapper = mount(DynamicIgnorePreview, {
    global: {
      plugins: [createI18n('en')],
      provide: { [EDIT_PAGE_KEY as symbol]: page },
    },
    attachTo: document.body,
  });
  return { wrapper, state };
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ approved: ['BTC'], ignored: [] }), { status: 200 })
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('refresh policy', () => {
  it('refreshes immediately when the checkbox flips on', async () => {
    const { wrapper, state } = mountPreview();
    state.dynamicIgnore = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.get('#di-approved').text()).toContain('BTC');
    wrapper.unmount();
  });

  it('debounces rapid filter edits into ONE fetch after 600 ms', async () => {
    const { wrapper, state } = mountPreview();
    state.dynamicIgnore = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // checkbox flip — immediate

    // two rapid market-cap keystrokes while the preview is enabled
    state.marketCap = '100';
    await vi.advanceTimersByTimeAsync(100);
    state.marketCap = '150';
    await vi.advanceTimersByTimeAsync(599); // 599 ms since the LAST edit
    expect(fetchMock).toHaveBeenCalledTimes(1); // still debounced

    await vi.advanceTimersByTimeAsync(2);
    expect(fetchMock).toHaveBeenCalledTimes(2); // exactly one fetch per burst

    const query = String(fetchMock.mock.calls[1]![0]);
    expect(query).toContain('/coins/filter?exchange=binance');
    expect(query).toContain('market_cap=150');
    wrapper.unmount();
  });

  it('never fetches for filter edits while the checkbox is off', async () => {
    const { wrapper, state } = mountPreview();
    state.marketCap = '200';
    state.volMcap = '3';
    await vi.runAllTimersAsync();
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('cancels the pending debounce on unmount', async () => {
    const { wrapper, state } = mountPreview();
    state.dynamicIgnore = true;
    await vi.advanceTimersByTimeAsync(0);
    state.marketCap = '300';
    wrapper.unmount();
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the checkbox flip
  });
});
