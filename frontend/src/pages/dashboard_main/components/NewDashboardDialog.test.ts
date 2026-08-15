import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import NewDashboardDialog from './NewDashboardDialog.vue';

enableAutoUnmount(afterEach);

// Attached to the document body: jsdom's getComputedStyle only resolves
// inline styles (v-show) reliably for connected elements.
const hosts: HTMLElement[] = [];

function mountDialog(props: { visible?: boolean; existingNames?: string[] } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  return mount(NewDashboardDialog, {
    props: { visible: false, existingNames: [], ...props },
    global: { plugins: [createI18n('en')] },
    attachTo: host,
  });
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

function nameInput(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.find('#new-dash-name');
}

describe('NewDashboardDialog', () => {
  it('is hidden until visible', () => {
    const wrapper = mountDialog();

    expect(wrapper.find('#new-dash-dialog').isVisible()).toBe(false);
  });

  it('renders the legacy dialog chrome with i18n labels', () => {
    const wrapper = mountDialog({ visible: true });

    expect(wrapper.find('.dlg-title').text()).toBe('+ New Dashboard');
    expect(wrapper.find('label').text()).toBe('Dashboard Name');
    expect(wrapper.find('#new-dash-name').attributes('maxlength')).toBe('32');
    expect(wrapper.find('#new-dash-name').attributes('placeholder')).toBe('e.g. My Portfolio');
    expect(wrapper.find('#new-dash-cancel').text()).toBe('Cancel');
    expect(wrapper.find('#new-dash-ok').text()).toBe('Create & Edit');
  });

  it('resets the name and error when reopened', async () => {
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true });
    await wrapper.find('#new-dash-ok').trigger('click'); // empty name → error state
    expect(wrapper.find('.dlg-err').isVisible()).toBe(true);
    expect(nameInput(wrapper).classes()).toContain('err');

    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });

    expect((nameInput(wrapper).element as HTMLInputElement).value).toBe('');
    expect(wrapper.find('.dlg-err').isVisible()).toBe(false);
    expect(nameInput(wrapper).classes()).not.toContain('err');
  });

  it('focuses the name input 50ms after opening (legacy setTimeout focus)', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountDialog();
      await wrapper.setProps({ visible: true });
      vi.advanceTimersByTime(50);

      expect(document.activeElement).toBe(nameInput(wrapper).element);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the pleaseEnterName error when OK is clicked with an empty name', async () => {
    const wrapper = mountDialog({ visible: true });

    await wrapper.find('#new-dash-ok').trigger('click');

    expect(wrapper.find('.dlg-err').isVisible()).toBe(true);
    expect(wrapper.find('.dlg-err').text()).toBe('Please enter a name.');
    expect(nameInput(wrapper).classes()).toContain('err');
    expect(wrapper.emitted('create')).toBeUndefined();
  });

  it('shows the nameExists error when the name is already taken', async () => {
    const wrapper = mountDialog({ visible: true, existingNames: ['Taken'] });

    await nameInput(wrapper).setValue('Taken');
    await wrapper.find('#new-dash-ok').trigger('click');

    expect(wrapper.find('.dlg-err').text()).toBe('A dashboard with this name already exists.');
    expect(wrapper.emitted('create')).toBeUndefined();
  });

  it('emits create with the trimmed name when valid', async () => {
    const wrapper = mountDialog({ visible: true, existingNames: ['Taken'] });

    await nameInput(wrapper).setValue('  Fresh Dash  ');
    await wrapper.find('#new-dash-ok').trigger('click');

    expect(wrapper.emitted('create')).toEqual([['Fresh Dash']]);
  });

  it('submits on Enter and closes on Escape', async () => {
    const wrapper = mountDialog({ visible: true });

    await nameInput(wrapper).setValue('Keyed');
    await nameInput(wrapper).trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('create')).toEqual([['Keyed']]);

    await nameInput(wrapper).trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('emits close from the cancel button', async () => {
    const wrapper = mountDialog({ visible: true });

    await wrapper.find('#new-dash-cancel').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('shows localized labels in zh', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    hosts.push(host);
    const wrapper = mount(NewDashboardDialog, {
      props: { visible: true, existingNames: [] },
      global: { plugins: [createI18n('zh')] },
      attachTo: host,
    });

    expect(wrapper.find('.dlg-title').text()).toBe('+ 新建仪表盘');
    expect(wrapper.find('#new-dash-ok').text()).toBe('创建并编辑');
  });
});
