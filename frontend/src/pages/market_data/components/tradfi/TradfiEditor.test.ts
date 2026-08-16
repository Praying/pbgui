import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import TradfiEditor from './TradfiEditor.vue';
import { useTradfiMap, type TradfiMapPayload } from '../../composables/useTradfiMap';
import type { TradfiRow } from '../../lib/tradfiFilters';

/* TradfiEditor — legacy .tradfi-editor-shell (market_data_main.html
   :3168-3217) with the mode note (:6427, :6461-6463), read-only xyz while
   editing a row (:6458), the invert toggle (:3209-3212) and the
   cancel/save buttons (:6725-6715 / :9728-9729). */

const T = (key: string): string => key;

function payloadFixture(rows: TradfiRow[]): TradfiMapPayload {
  return {
    rows,
    type_values: ['equity_us', 'fx'],
    status_values: ['ok', 'alias'],
    canonical_types: ['equity_us', 'fx'],
    statuses: ['ok', 'alias', 'pending'],
  };
}

function makeEditor(rows: TradfiRow[]) {
  const fetchJson = vi.fn(async () => ({ success: true, payload: payloadFixture(rows) })) as never;
  const toasts: { message: string; level: string }[] = [];
  const map = useTradfiMap({
    api: { fetchJson },
    t: T,
    showToast: (message, level = 'info') => toasts.push({ message: String(message), level }),
    isTiingoConfigured: () => true,
  });
  const wrapper = mount(TradfiEditor, {
    props: { map },
    global: { plugins: [createI18n('en')] },
  });
  return { map, wrapper, toasts };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the mapping editor (:3168-3217)', () => {
  it('stays hidden until opened (:5741-5745)', async () => {
    const { map, wrapper } = makeEditor([{ xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok' }]);
    await map.loadMappings();
    map.selectCoin('TSLA');
    expect(wrapper.find('.tradfi-editor-shell').attributes('hidden')).toBeDefined();
    map.editSelected();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tradfi-editor-shell').attributes('hidden')).toBeUndefined();
  });

  it('renders the nine legacy fields with ids and option selects (:3175-3212)', async () => {
    const { map, wrapper } = makeEditor([{ xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok' }]);
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.editSelected();
    await wrapper.vm.$nextTick();
    for (const id of [
      'tradfi-editor-xyz-coin',
      'tradfi-editor-canonical-type',
      'tradfi-editor-status',
      'tradfi-editor-description',
      'tradfi-editor-tiingo-ticker',
      'tradfi-editor-tiingo-fx-ticker',
      'tradfi-editor-tiingo-start-date',
      'tradfi-editor-note',
      'tradfi-editor-tiingo-fx-invert',
    ]) {
      expect(wrapper.find(`#${id}`).exists(), id).toBe(true);
    }
    expect(wrapper.find('#tradfi-editor-canonical-type').findAll('option').map((o) => o.element.value))
      .toEqual(['equity_us', 'fx']);
    expect(wrapper.find('#tradfi-editor-status').findAll('option').map((o) => o.element.value))
      .toEqual(['ok', 'alias', 'pending']);
  });

  it('shows the editingSavedMapping mode note for an in-map row (:6462)', async () => {
    const { map, wrapper } = makeEditor([
      { xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok', _in_map: true },
    ]);
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.editSelected();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#tradfi-editor-mode').text()).toContain('Editing saved mapping for XYZ-TSLA');
    expect((wrapper.find('#tradfi-editor-xyz-coin').element as HTMLInputElement).readOnly).toBe(true);
  });

  it('shows the mapping.json mode note otherwise (:6463)', async () => {
    const { map, wrapper } = makeEditor([
      { xyz_coin: 'NEW', canonical_type: 'equity_us', status: 'pending', _in_map: false },
    ]);
    await map.loadMappings();
    map.selectCoin('NEW');
    map.editSelected();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#tradfi-editor-mode').text()).toContain('from mapping.json');
  });

  it('shows the select-a-row note after a reset (:6427)', async () => {
    const { map, wrapper } = makeEditor([
      { xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok', _in_map: true },
    ]);
    await map.loadMappings();
    map.editSelected();
    map.cancelEditor();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#tradfi-editor-mode').text()).toBe('Select a row to edit its mapping.');
  });

  it('binds edits into the controller editor state', async () => {
    const { map, wrapper } = makeEditor([
      { xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok', _in_map: true },
    ]);
    await map.loadMappings();
    map.editSelected();
    await wrapper.vm.$nextTick();
    await wrapper.find('#tradfi-editor-description').setValue('Tesla, Inc.');
    expect(map.editor.description).toBe('Tesla, Inc.');
    const invert = wrapper.find('#tradfi-editor-tiingo-fx-invert');
    await invert.setValue(true);
    expect(map.editor.fxInvert).toBe(true);
  });

  it('wires cancel and save (:9725-9729)', async () => {
    const { map, wrapper } = makeEditor([
      { xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok', _in_map: true },
    ]);
    await map.loadMappings();
    map.selectCoin('TSLA');
    map.editSelected();
    const cancel = vi.fn();
    const save = vi.fn();
    map.cancelEditor = cancel;
    map.saveMapping = save;
    await wrapper.find('#btn-tradfi-cancel').trigger('click');
    await wrapper.find('#btn-tradfi-save').trigger('click');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
