import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { useConfirmDialog, type ConfirmDialogController } from './useConfirmDialog';

/* The shared promise modal — legacy showConfirmDialog/closeConfirmDialog
   (market_data_main.html:8161-8215, :8141-8159) plus the document
   Escape/Enter keys (:9588-9599). Rendered here through the ConfirmDialog
   component that owns the #confirm-ovl markup (:2893-2915). */

type Translate = (key: string, params?: Record<string, unknown>) => string;

function makeController(t?: Translate): ConfirmDialogController {
  return useConfirmDialog({
    t: t ?? ((key) => ({ 'common.confirmAction': 'Confirm action', 'common.areYouSure': 'Are you sure?', 'common.confirm': 'Confirm', 'common.cancel': 'Cancel', 'market.selectedItems': 'Selected items' })[key] ?? key),
  });
}

function mountDialog(controller: ConfirmDialogController) {
  return mount(ConfirmDialog, {
    props: { dialog: controller },
    global: { plugins: [createI18n('en')] },
    attachTo: document.body,
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useConfirmDialog', () => {
  it('resolves true on accept and false on cancel (:8209-8214, :9556-9559)', async () => {
    const controller = makeController();
    const accepted = controller.confirm({ message: 'remove?' });
    expect(controller.visible.value).toBe(true);
    controller.accept();
    await expect(accepted).resolves.toBe(true);
    const rejected = controller.confirm({ message: 'remove?' });
    controller.cancel();
    await expect(rejected).resolves.toBe(false);
  });

  it('replaces a pending dialog by resolving it false (:8177-8181)', async () => {
    const controller = makeController();
    const first = controller.confirm({ message: 'one' });
    const second = controller.confirm({ message: 'two' });
    await expect(first).resolves.toBe(false);
    expect(controller.state.value.message).toBe('two');
    controller.accept();
    await expect(second).resolves.toBe(true);
  });

  it('applies the legacy defaults and trims the item list (:8183-8196)', async () => {
    const controller = makeController();
    void controller.confirm({
      items: [' BTC ', '', 0, 'ETH', null],
    });
    expect(controller.state.value.title).toBe('Confirm action');
    expect(controller.state.value.message).toBe('Are you sure?');
    expect(controller.state.value.confirmText).toBe('Confirm');
    expect(controller.state.value.listLabel).toBe('Selected items'); // :8196 effective default
    expect(controller.state.value.items).toEqual(['BTC', 'ETH']);
    controller.cancel();
  });

  it('hides the detail when empty (:8192-8194)', async () => {
    const controller = makeController();
    void controller.confirm({ detail: '   ' });
    expect(controller.state.value.detail).toBe('');
    controller.cancel();
  });
});

describe('ConfirmDialog component', () => {
  it('renders the legacy overlay structure while open (:2893-2915)', async () => {
    const controller = makeController();
    const wrapper = mountDialog(controller);
    expect(wrapper.find('#confirm-ovl').exists()).toBe(true);
    expect(wrapper.find('#confirm-ovl').attributes('aria-hidden')).toBe('true');
    void controller.confirm({
      title: 'Remove unavailable markets',
      message: 'Remove 2 markets?',
      detail: '3 files, 1.50 KB',
      items: ['OLD1', 'OLD2'],
      listLabel: 'Unavailable markets',
      confirmText: 'Remove market data',
    });
    await nextTick();
    const overlay = wrapper.find('#confirm-ovl');
    expect(overlay.classes()).toContain('visible');
    expect(overlay.attributes('aria-hidden')).toBe('false');
    expect(wrapper.find('#confirm-title').text()).toBe('Remove unavailable markets');
    expect(wrapper.find('#confirm-message').text()).toBe('Remove 2 markets?');
    expect(wrapper.find('#confirm-detail').attributes('hidden')).toBeUndefined();
    expect(wrapper.find('#confirm-list-label').text()).toBe('Unavailable markets');
    expect(wrapper.findAll('.confirm-list-item').map((i) => i.text())).toEqual(['OLD1', 'OLD2']);
    expect(wrapper.find('#btn-confirm-accept').text()).toBe('Remove market data');
    expect(wrapper.find('#confirm-warning').text()).toContain('cannot be undone');
  });

  it('hides detail and list when absent (:8194, :8201-8205)', async () => {
    const controller = makeController();
    const wrapper = mountDialog(controller);
    void controller.confirm({ message: 'plain' });
    await nextTick();
    expect(wrapper.find('#confirm-detail').attributes('hidden')).toBeDefined();
    expect(wrapper.find('#confirm-list-wrap').attributes('hidden')).toBeDefined();
    controller.cancel();
    await nextTick();
  });

  it('focuses the accept button on open and returns focus on close (:8207, :8151)', async () => {
    const opener = document.createElement('button');
    opener.id = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    const controller = makeController();
    const wrapper = mountDialog(controller);
    const request = controller.confirm({});
    await nextTick();
    expect(document.activeElement?.id).toBe('btn-confirm-accept');
    await wrapper.find('#btn-confirm-cancel').trigger('click');
    await expect(request).resolves.toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(wrapper.find('#confirm-ovl').classes()).not.toContain('visible');
  });

  it('closes on Escape and accepts on Enter while open (:9588-9599)', async () => {
    const controller = makeController();
    mountDialog(controller);
    const request = controller.confirm({});
    await nextTick();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(request).resolves.toBe(false);
    const request2 = controller.confirm({});
    await nextTick();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await expect(request2).resolves.toBe(true);
  });

  it('leaves button-targeted Enter to the native click (:9594-9596)', async () => {
    const controller = makeController();
    const wrapper = mountDialog(controller);
    const request = controller.confirm({});
    await nextTick();
    const accept = wrapper.find('#btn-confirm-accept');
    (accept.element as HTMLButtonElement).focus();
    (accept.element as HTMLButtonElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(controller.visible.value).toBe(true); // not consumed
    await accept.trigger('click');
    await expect(request).resolves.toBe(true);
  });

  it('ignores keys while closed (:9590)', async () => {
    const controller = makeController();
    mountDialog(controller);
    const handled = controller.handleKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handled).toBe(false);
    expect(controller.visible.value).toBe(false);
  });
});

describe('confirm wiring smoke', () => {
  it('resolve shape is boolean-only (:8158)', async () => {
    const controller = makeController();
    const request = controller.confirm({});
    controller.cancel();
    await expect(request).resolves.toBe(false);
  });

  it('vi.fn t receives the default keys it translates', async () => {
    const t = vi.fn((key: string) => key);
    const controller = useConfirmDialog({ t });
    void controller.confirm({ title: 'T', message: 'M', confirmText: 'C' });
    expect(t).toHaveBeenCalledWith('market.selectedItems'); // the listLabel default (:8196)
    controller.cancel();
  });
});
