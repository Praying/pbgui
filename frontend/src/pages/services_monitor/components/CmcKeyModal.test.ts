import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from '@/shared/i18n';
import CmcKeyModal from './CmcKeyModal.vue';
import type { CmcKey } from '../types';

const SELECTED: CmcKey = {
  id: 'k1',
  label: 'Primary',
  imported: true,
  shared: false,
  active: false,
};

function mountModal(props: {
  open?: boolean;
  mode?: 'add' | 'rotate' | 'edit';
  selected?: CmcKey | null;
  busy?: boolean;
  error?: string;
} = {}) {
  return mount(CmcKeyModal, {
    props: {
      open: props.open ?? true,
      mode: props.mode ?? 'add',
      selected: props.selected ?? null,
      busy: props.busy ?? false,
      error: props.error ?? '',
    },
    global: { plugins: [createI18n('en')] },
  });
}

describe('CmcKeyModal (legacy openCmcKeyModal/submitCmcKey)', () => {
  it('renders the add title and submit label in add mode', () => {
    const wrapper = mountModal();

    expect(wrapper.find('.cmc-modal-title').text()).toBe('Add CMC Key');
    expect(wrapper.find('#cmc-key-submit').text()).toBe('Add Key');
    // Every field is visible in add mode.
    expect(wrapper.find('#cmc-key-label-field').isVisible()).toBe(true);
    expect(wrapper.find('#cmc-key-secret-field').isVisible()).toBe(true);
    expect(wrapper.find('#cmc-key-options').isVisible()).toBe(true);
  });

  it('hides label and options on rotate and titles with the key label', () => {
    const wrapper = mountModal({ mode: 'rotate', selected: SELECTED });

    expect(wrapper.find('.cmc-modal-title').text()).toBe('Rotate Primary');
    expect(wrapper.find('#cmc-key-submit').text()).toBe('Rotate');
    expect(wrapper.find('#cmc-key-label-field').isVisible()).toBe(false);
    expect(wrapper.find('#cmc-key-options').isVisible()).toBe(false);
    expect(wrapper.find('#cmc-key-secret-field').isVisible()).toBe(true);
  });

  it('hides the secret on edit and prefills the selected key fields', async () => {
    const wrapper = mountModal({ mode: 'edit', selected: SELECTED });

    expect(wrapper.find('.cmc-modal-title').text()).toBe('Edit Primary');
    expect(wrapper.find('#cmc-key-submit').text()).toBe('Save');
    expect(wrapper.find('#cmc-key-secret-field').isVisible()).toBe(false);

    await nextTick();
    expect((wrapper.find('#cmc-key-label').element as HTMLInputElement).value).toBe('Primary');
    expect(wrapper.find('#cmc-key-imported').attributes('data-state')).toBe('checked');
    expect(wrapper.find('#cmc-key-shared').attributes('data-state')).toBe('unchecked');
    expect(wrapper.find('#cmc-key-active').attributes('data-state')).toBe('unchecked');
  });

  it('defaults add-mode checkboxes to imported/shared off and active on', async () => {
    const wrapper = mountModal();
    await nextTick();

    expect(wrapper.find('#cmc-key-imported').attributes('data-state')).toBe('unchecked');
    expect(wrapper.find('#cmc-key-active').attributes('data-state')).toBe('checked');
  });

  it('resets the fields when reopened (legacy per-open reinit)', async () => {
    const wrapper = mountModal();
    await nextTick();
    await wrapper.find('#cmc-key-secret').setValue('leftover');
    await wrapper.find('#cmc-key-label').setValue('leftover');

    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await nextTick();

    expect((wrapper.find('#cmc-key-secret').element as HTMLInputElement).value).toBe('');
    expect((wrapper.find('#cmc-key-label').element as HTMLInputElement).value).toBe('');
  });

  it('blocks submit with secretRequired when the secret is blank in add/rotate mode', async () => {
    const wrapper = mountModal();

    await wrapper.find('#cmc-key-submit').trigger('click');

    expect(wrapper.find('.cmc-modal-error').text()).toBe('A non-empty secret is required.');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('allows an empty secret in edit mode and emits the patch payload', async () => {
    const wrapper = mountModal({ mode: 'edit', selected: SELECTED });

    await wrapper.find('#cmc-key-submit').trigger('click');

    expect(wrapper.emitted('submit')).toEqual([
      [{ secret: '', label: 'Primary', imported: true, shared: false, active: false }],
    ]);
    expect(wrapper.find('.cmc-modal-error').text()).toBe('');
  });

  it('emits the add payload with the entered secret', async () => {
    const wrapper = mountModal();
    await wrapper.find('#cmc-key-secret').setValue('abc123');
    await wrapper.find('#cmc-key-label').setValue('My key');
    await wrapper.find('#cmc-key-shared').trigger('click');

    await wrapper.find('#cmc-key-submit').trigger('click');

    expect(wrapper.emitted('submit')).toEqual([
      [{ secret: 'abc123', label: 'My key', imported: false, shared: true, active: true }],
    ]);
  });

  it('displays the mutation error prop from the parent', async () => {
    const wrapper = mountModal({ error: 'server said no' });

    expect(wrapper.find('.cmc-modal-error').text()).toBe('server said no');
  });

  it('requests closing via v-model unless busy (legacy closeCmcKeyModal guard)', async () => {
    const wrapper = mountModal();

    await wrapper.find('.cmc-modal-close').trigger('click');
    expect(wrapper.emitted('update:open')).toEqual([[false]]);

    await wrapper.setProps({ busy: true });
    await wrapper.find('.cmc-modal-actions button:not(.save)').trigger('click'); // Cancel
    expect(wrapper.emitted('update:open')).toHaveLength(1); // no new close while busy
    expect((wrapper.find('#cmc-key-submit').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('exposes clearSecretIfUnchanged for the mutation engine (legacy secret clearing)', async () => {
    const wrapper = mountModal();
    await wrapper.find('#cmc-key-secret').setValue('abc');

    wrapper.vm.clearSecretIfUnchanged('other');
    expect((wrapper.find('#cmc-key-secret').element as HTMLInputElement).value).toBe('abc');

    wrapper.vm.clearSecretIfUnchanged('abc');
    await nextTick(); // v-model clear re-renders the input
    expect((wrapper.find('#cmc-key-secret').element as HTMLInputElement).value).toBe('');
  });

  it('renders nothing while closed', () => {
    const wrapper = mountModal({ open: false });

    expect(wrapper.find('.cmc-modal-backdrop').exists()).toBe(false);
  });
});
