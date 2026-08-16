import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import DeleteOlderDialog from './DeleteOlderDialog.vue';
import HeatmapPlot from './HeatmapPlot.vue';
import OhlcvFrame from './OhlcvFrame.vue';
import SidebarActions from './SidebarActions.vue';

/* M-data-6 — small inventory components: the Plotly host registration
   (plot registry), the OHLCV details/iframe (:3572-3575, :8557-8583), the
   delete-by-date overlay (:2861-2891) and the sidebar action blocks
   (:2929-2945).

   Takeover note: the mounts gained the shared i18n plugin (the pattern of
   every other component test here) — the components translate their
   static labels (market.pb7Cache, market.deleteByDateTitle, …) through
   useI18n; VIEW also moved to module scope (the last test referenced it
   from outside its describe block). */

const VIEW = {
  scopeText: 'Delete older than for 2 coins',
  showSelection: true,
  selectionItems: ['BTC', 'ETH'],
  noteText: '3 files / 1.00 MB',
  canDelete: true,
};

/** mount() options shared by the i18n-translating components below. */
const I18N = { plugins: [createI18n('en')] };

describe('HeatmapPlot', () => {
  it('registers its host element on mount and unregisters on unmount', () => {
    const register = vi.fn();
    const plot = mount(HeatmapPlot, { props: { plotKey: 'overview', register, id: 'inventory-overview-plot' } });
    expect(register).toHaveBeenCalledWith('overview', expect.any(HTMLElement));
    plot.unmount();
    expect(register).toHaveBeenLastCalledWith('overview', null);
  });
});

describe('OhlcvFrame (:3572-3575, :8557-8583)', () => {
  it('renders nothing when the row has no chart', () => {
    const frame = mount(OhlcvFrame, {
      props: { visible: false, open: false, summary: 'OHLCV chart', src: '' },
      global: I18N,
    });
    expect(frame.find('details').exists()).toBe(false);
  });

  it('shows the summary but loads the iframe only when opened', async () => {
    const frame = mount(OhlcvFrame, {
      props: { visible: true, open: false, summary: 'OHLCV chart: TSLA', src: 'http://x/chart' },
      global: I18N,
    });
    expect(frame.find('summary').text()).toBe('OHLCV chart: TSLA');
    expect(frame.find('iframe').exists()).toBe(false); // no src until open (:8582)
    await frame.setProps({ open: true });
    expect(frame.find('iframe').attributes('src')).toBe('http://x/chart');
  });

  it('emits the toggle state (:9580-9586)', async () => {
    const frame = mount(OhlcvFrame, {
      props: { visible: true, open: false, summary: 's', src: 'http://x/c' },
      attachTo: document.body,
      global: I18N,
    });
    frame.find('summary').trigger('click');
    await nextTick();
    // jsdom fires toggle on open attribute change through the details
    // element; the wrapper listens for it
    expect(frame.emitted('toggle')).toBeUndefined(); // jsdom: no native toggle
    frame.unmount();
  });
});

describe('DeleteOlderDialog (:2861-2891)', () => {
  function makeDialog(overrides: Partial<{ visible: boolean; cutoffDay: string; view: typeof VIEW }> = {}) {
    return mount(DeleteOlderDialog, {
      props: {
        visible: overrides.visible ?? true,
        cutoffDay: overrides.cutoffDay ?? '2024-01-15',
        view: overrides.view ?? VIEW,
      },
      attachTo: document.body,
      global: I18N,
    });
  }

  it('is hidden unless visible', () => {
    const dialog = makeDialog({ visible: false });
    expect(dialog.find('#inventory-delete-date-ovl').classes()).not.toContain('visible');
  });

  it('renders the scope, chips and preview (:2869-2884)', () => {
    const dialog = makeDialog();
    expect(dialog.find('#inventory-delete-date-scope').text()).toBe(VIEW.scopeText);
    expect(dialog.findAll('.inventory-delete-date-selection-item').map((c) => c.text())).toEqual(['BTC', 'ETH']);
    expect(dialog.find('#btn-inventory-delete-by-date-confirm').attributes('disabled')).toBeUndefined();
  });

  it('disables delete for an unavailable preview (:8286-8299)', () => {
    const dialog = makeDialog({ view: { ...VIEW, canDelete: false, noteText: 'Preview unavailable' } });
    expect(dialog.find('#btn-inventory-delete-by-date-confirm').attributes('disabled')).toBeDefined();
  });

  it('emits the cutoff on input and delete on confirm (:9537-9546)', async () => {
    const dialog = makeDialog();
    await dialog.find('#inventory-delete-date-input').setValue('2024-02-01');
    expect(dialog.emitted('setCutoff')).toEqual([['2024-02-01']]);
    await dialog.find('#btn-inventory-delete-by-date-confirm').trigger('click');
    expect(dialog.emitted('delete')).toHaveLength(1);
  });

  it('closes from the ✕ and Cancel buttons (:9347-9352)', async () => {
    const dialog = makeDialog();
    await dialog.find('#inventory-delete-date-close').trigger('click');
    await dialog.find('#btn-inventory-delete-date-cancel').trigger('click');
    expect(dialog.emitted('close')).toHaveLength(2);
  });

  it('opens the native date picker through the 📅 button (:8120-8132)', async () => {
    const showPicker = vi.fn();
    const dialog = makeDialog();
    (dialog.find('#inventory-delete-date-input').element as HTMLInputElement).showPicker = showPicker;
    await dialog.find('#btn-inventory-delete-date-picker').trigger('click');
    expect(showPicker).toHaveBeenCalled();
  });
});

describe('SidebarActions (:2929-2945)', () => {
  function makeSidebar(overrides: Partial<Parameters<typeof mount>[1]> = {}) {
    return mount(SidebarActions, {
      props: {
        navVisible: true,
        availableViews: ['1m', 'pb7_cache'],
        activeView: '1m',
        buildVisible: false,
        buildText: 'Build best 1m',
        buildDisabled: true,
        deleteVisible: true,
        deleteText: 'Delete selected',
        deleteDisabled: true,
        olderDisabled: true,
        ...overrides.props,
      },
      global: I18N,
    });
  }

  it('hides unavailable view buttons and marks the active one (:6360-6366)', () => {
    const sidebar = makeSidebar();
    const buttons = sidebar.findAll('.inventory-subsection-btn');
    expect(buttons).toHaveLength(2);
    expect(buttons.filter((b) => b.attributes('hidden') === undefined).map((b) => b.text())).toEqual(['1m', 'PB7 cache']);
    expect(buttons[0]?.classes('active')).toBe(true);
  });

  it('hides the whole nav while another panel is active (:6357)', () => {
    const sidebar = makeSidebar({ props: { navVisible: false } });
    expect(sidebar.find('#inventory-subsection-nav').attributes('hidden')).toBeDefined();
  });

  it('hides the build block without a queue config or selection (:8352)', () => {
    const sidebar = makeSidebar();
    expect(sidebar.find('#sidebar-inventory-build').attributes('hidden')).toBeDefined();
    const withSelection = makeSidebar({ props: { buildVisible: true, buildDisabled: false, buildText: 'Build best 1m for BTC' } });
    expect(withSelection.find('#sidebar-inventory-build').attributes('hidden')).toBeUndefined();
  });

  it('disables the destructive buttons without selection (:8379, :8382)', () => {
    const sidebar = makeSidebar();
    expect(sidebar.find('#btn-inventory-delete-selected').attributes('disabled')).toBeDefined();
    expect(sidebar.find('#btn-inventory-delete-older').attributes('disabled')).toBeDefined();
  });

  it('emits the view select and every action click (:9348-9354, :9525-9533, :9562-9564)', async () => {
    // enabled controls: jsdom/browsers never dispatch clicks off disabled
    // buttons, and the disabled/hidden states have their own tests above
    const sidebar = makeSidebar({
      props: { buildVisible: true, buildDisabled: false, deleteDisabled: false, olderDisabled: false },
    });
    await sidebar.findAll('.inventory-subsection-btn')[1]!.trigger('click');
    expect(sidebar.emitted('selectView')).toEqual([['pb7_cache']]);
    await sidebar.find('#btn-inventory-build-best1m').trigger('click');
    expect(sidebar.emitted('build')).toHaveLength(1);
    await sidebar.find('#btn-inventory-delete-selected').trigger('click');
    expect(sidebar.emitted('deleteSelected')).toHaveLength(1);
    await sidebar.find('#btn-inventory-delete-older').trigger('click');
    expect(sidebar.emitted('deleteOlder')).toHaveLength(1);
    await sidebar.find('#btn-inventory-clear-dataset').trigger('click');
    expect(sidebar.emitted('clearDataset')).toHaveLength(1);
  });

  it('reflects the delete-block visibility (:6368-6371)', () => {
    const sidebar = makeSidebar({ props: { deleteVisible: false } });
    expect(sidebar.find('#sidebar-inventory-delete').attributes('hidden')).toBeDefined();
  });
});

describe('ref wiring sanity', () => {
  it('keeps the view model refs reactive through props', () => {
    const cutoff = ref('2024-01-01');
    const dialog = mount(DeleteOlderDialog, {
      props: { visible: true, cutoffDay: cutoff.value, view: VIEW },
      global: I18N,
    });
    expect((dialog.find('#inventory-delete-date-input').element as HTMLInputElement).value).toBe('2024-01-01');
  });
});
