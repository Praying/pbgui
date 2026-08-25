import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from '@/shared/i18n';
import { openSelect, pickSelectOption, selectOptionTexts } from '@/shared/testing/select';
import CmcAuthorityModal from './CmcAuthorityModal.vue';

const OPTIONS = [
  { nodeId: 'node-a', text: 'Alpha (node-a)' },
  { nodeId: 'node-b', text: 'Bravo (node-b)' },
];

afterEach(() => {
  // The reka select portals its listbox into document.body — clear it so a
  // stale list from a previous test cannot intercept option lookups.
  document.body.innerHTML = '';
});

function mountModal(props: {
  open?: boolean;
  busy?: boolean;
  error?: string;
  quotaDomain?: string;
  currentText?: string;
  options?: { nodeId: string; text: string }[];
} = {}) {
  return mount(CmcAuthorityModal, {
    props: {
      open: props.open ?? true,
      busy: props.busy ?? false,
      error: props.error ?? '',
      quotaDomain: props.quotaDomain ?? 'cmc-main',
      currentText: props.currentText ?? 'pb1 · epoch 3 · reachable yes',
      options: props.options ?? OPTIONS,
    },
    global: { plugins: [createI18n('en')] },
  });
}

describe('CmcAuthorityModal (legacy openCmcAuthorityModal markup)', () => {
  it('renders the domain, current assignment and eligible nodes', async () => {
    const wrapper = mountModal();

    expect(wrapper.find('.cmc-modal-title').text()).toBe('Transfer CMC Authority');
    expect(wrapper.find('#cmc-authority-domain').text()).toBe('cmc-main');
    expect(wrapper.find('#cmc-authority-current').text()).toBe('pb1 · epoch 3 · reachable yes');
    await openSelect(wrapper, '#cmc-authority-target');
    expect(selectOptionTexts()).toEqual(['Alpha (node-a)', 'Bravo (node-b)']);
    // The first eligible node is preselected (legacy openCmcAuthorityModal).
    expect(wrapper.find('#cmc-authority-target').text()).toContain('Alpha (node-a)');
  });

  it('defaults the selection to the first option on each open', async () => {
    const wrapper = mountModal();

    await pickSelectOption(wrapper, '#cmc-authority-target', 'Bravo (node-b)');
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await nextTick();

    expect(wrapper.find('#cmc-authority-target').text()).toContain('Alpha (node-a)');
  });

  it('emits submit with the selected node id', async () => {
    const wrapper = mountModal();

    await pickSelectOption(wrapper, '#cmc-authority-target', 'Bravo (node-b)');
    await wrapper.find('#cmc-authority-submit').trigger('click');

    expect(wrapper.emitted('submit')).toEqual([['node-b']]);
  });

  it('does not emit submit without a selection (legacy guard)', async () => {
    const wrapper = mountModal({ options: [] });

    await wrapper.find('#cmc-authority-submit').trigger('click');

    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('shows the mutation error and disables submit while busy', async () => {
    const wrapper = mountModal({ error: 'conflict' });
    expect(wrapper.find('.cmc-modal-error').text()).toBe('conflict');

    await wrapper.setProps({ busy: true });
    expect((wrapper.find('#cmc-authority-submit').element as HTMLButtonElement).disabled).toBe(true);

    // Close is blocked while busy (legacy closeCmcAuthorityModal guard).
    await wrapper.find('.cmc-modal-close').trigger('click');
    expect(wrapper.emitted('update:open')).toBeUndefined();
  });

  it('requests closing via v-model when idle', async () => {
    const wrapper = mountModal();

    await wrapper.find('.cmc-modal-actions button:not(.save)').trigger('click'); // Cancel

    expect(wrapper.emitted('update:open')).toEqual([[false]]);
  });

  it('renders nothing while closed', () => {
    const wrapper = mountModal({ open: false });

    expect(wrapper.find('.cmc-modal-backdrop').exists()).toBe(false);
  });
});
