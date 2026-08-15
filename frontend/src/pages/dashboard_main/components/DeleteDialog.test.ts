import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import DeleteDialog from './DeleteDialog.vue';

enableAutoUnmount(afterEach);

// Attached to the document body: jsdom's getComputedStyle only resolves
// inline styles (v-show) reliably for connected elements.
const hosts: HTMLElement[] = [];

function mountDialog(props: { visible?: boolean; names?: string[] } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  return mount(DeleteDialog, {
    props: { visible: false, names: [], ...props },
    global: { plugins: [createI18n('en')] },
    attachTo: host,
  });
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

describe('DeleteDialog', () => {
  it('is hidden until visible', () => {
    const wrapper = mountDialog();

    expect(wrapper.find('#del-dash-dialog').isVisible()).toBe(false);
  });

  it('renders the legacy dialog chrome with i18n labels', () => {
    const wrapper = mountDialog({ visible: true, names: ['X'] });

    expect(wrapper.find('.dlg-title').text()).toBe('🗑 Delete Dashboard');
    expect(wrapper.find('#del-cancel').text()).toBe('Cancel');
    expect(wrapper.find('#del-ok').text()).toBe('Delete');
  });

  it('renders a quoted name for a single dashboard', () => {
    const wrapper = mountDialog({ visible: true, names: ['My Dash'] });

    expect(wrapper.find('#del-confirm-text').text()).toBe('Delete “My Dash”? This cannot be undone.');
  });

  it('renders the dashboardsCount message for multiple dashboards', () => {
    const wrapper = mountDialog({ visible: true, names: ['A', 'B', 'C'] });

    expect(wrapper.find('#del-confirm-text').text()).toBe('Delete 3 dashboards? This cannot be undone.');
  });

  it('renders the count message localized in zh', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    hosts.push(host);
    const wrapper = mount(DeleteDialog, {
      props: { visible: true, names: ['A', 'B'] },
      global: { plugins: [createI18n('zh')] },
      attachTo: host,
    });

    expect(wrapper.find('#del-confirm-text').text()).toBe('删除 2 个仪表盘？此操作无法撤销。');
  });

  it('emits close from the cancel button', async () => {
    const wrapper = mountDialog({ visible: true, names: ['X'] });

    await wrapper.find('#del-cancel').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('emits confirm from the delete button', async () => {
    const wrapper = mountDialog({ visible: true, names: ['X', 'Y'] });

    await wrapper.find('#del-ok').trigger('click');

    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});
