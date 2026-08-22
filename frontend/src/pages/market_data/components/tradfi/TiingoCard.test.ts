import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import TiingoCard from './TiingoCard.vue';
import { useTiingo, type TiingoApi } from '../../composables/useTiingo';

/* TiingoCard — legacy #settings-hyperliquid-tiingo (market_data_main.html
   :3077-3103): credential callout, token field + eye (:3092-3095), save
   button (:3098), test button (:3083) and the usage host (:3102). */

const T = (key: string): string => key;

function apiMock() {
  return {
    fetchJson: vi.fn(async () => ({}) as Record<string, unknown>),
    fetchApiKeysJson: vi.fn(async () => ({}) as Record<string, unknown>),
  } as unknown as TiingoApi;
}

function mountCard(configured = true, profileId = 'p1') {
  const toasts: { message: string; level: string }[] = [];
  const tiingo = useTiingo({
    api: apiMock(),
    t: T,
    showToast: (message, level = 'info') => toasts.push({ message: String(message), level }),
    reloadSettings: async () => {},
  });
  tiingo.applySettingsPayload(
    configured ? { tiingo_configured: true, tiingo_profile_id: profileId } : {}
  );
  const wrapper = mount(TiingoCard, {
    props: { tiingo },
    global: { plugins: [createI18n('en')] },
  });
  return { wrapper, tiingo, toasts };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the tiingo card (:3077-3103)', () => {
  it('renders the legacy card structure and ids', () => {
    const { wrapper } = mountCard();
    expect(wrapper.find('#settings-hyperliquid-tiingo').exists()).toBe(true);
    expect(wrapper.find('.eyebrow').text()).toBe('Tiingo Settings (stock-perp)');
    expect(wrapper.find('#btn-test-tiingo').exists()).toBe(true);
    expect(wrapper.find('#settings-tiingo-token').exists()).toBe(true);
    expect(wrapper.find('#btn-save-tiingo-token').exists()).toBe(true);
    expect(wrapper.find('#settings-tiingo-usage').exists()).toBe(true);
  });

  it('shows the vault-profile callout by configured state (:7390-7395)', () => {
    const on = mountCard(true).wrapper;
    expect(on.find('#settings-tiingo-credential-status').text()).toContain(
      'An active Tiingo vault profile is available'
    );
    const off = mountCard(false).wrapper;
    expect(off.find('#settings-tiingo-credential-status').text()).toContain(
      'No active Tiingo vault profile'
    );
  });

  it('swaps the token placeholder by configured state (:7386-7388)', () => {
    const on = mountCard(true).wrapper;
    expect(on.find('#settings-tiingo-token').attributes('placeholder')).toBe(
      'Stored in vault; enter only to replace'
    );
    const off = mountCard(false).wrapper;
    expect(off.find('#settings-tiingo-token').attributes('placeholder')).toBe(
      'Enter Tiingo API token'
    );
  });

  it('masks the token and toggles through the eye (:5598-5613)', async () => {
    const { wrapper, tiingo } = mountCard();
    const input = wrapper.find('#settings-tiingo-token');
    const eye = wrapper.find('.pw-eye-btn');
    expect((input.element as HTMLInputElement).type).toBe('password');
    expect(eye.find('svg').exists()).toBe(true);
    expect(eye.attributes('aria-label')).toBe('Show or hide the Tiingo token');
    await input.setValue('typed-token');
    await eye.trigger('click'); // unmask a locally typed value — no fetch
    expect((input.element as HTMLInputElement).type).toBe('text');
    expect(eye.find('svg').exists()).toBe(true);
    await eye.trigger('click'); // mask again — value survives
    expect((input.element as HTMLInputElement).type).toBe('password');
    expect(tiingo.tokenValue.value).toBe('typed-token');
  });

  it('reveals the stored token through the eye (:5620-5633)', async () => {
    const { wrapper, tiingo } = mountCard();
    tiingo.tokenValue.value = '';
    await wrapper.find('.pw-eye-btn').trigger('click');
    expect(tiingo.visible.value).toBe(true);
  });

  it('disables the eye while the reveal is in flight (:5622)', async () => {
    const { wrapper, tiingo } = mountCard();
    tiingo.revealLoading.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.pw-eye-btn').attributes('disabled')).toBeDefined();
  });

  it('wires the save and test buttons (:9689-9694)', async () => {
    const { wrapper, tiingo } = mountCard();
    const save = vi.spyOn(tiingo, 'saveToken');
    const test = vi.spyOn(tiingo, 'test');
    await wrapper.find('#btn-save-tiingo-token').trigger('click');
    await wrapper.find('#btn-test-tiingo').trigger('click');
    expect(save).toHaveBeenCalledTimes(1);
    expect(test).toHaveBeenCalledTimes(1);
  });

  it('disables the save button and input during a save (:8985-8986)', async () => {
    const { wrapper, tiingo } = mountCard();
    tiingo.saveLoading.value = true;
    tiingo.inputDisabled.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#btn-save-tiingo-token').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#settings-tiingo-token').attributes('disabled')).toBeDefined();
  });
});
