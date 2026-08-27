import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from '@/shared/i18n';
import BotSideEditor from './BotSideEditor.vue';

function mountEditors(shortParamStatus: Record<string, string> = {}) {
  const Harness = defineComponent({
    setup() {
      const longJson = ref('{\n  "total_wallet_exposure_limit": 1,\n  "n_positions": 1\n}');
      const shortJson = ref('{\n  "total_wallet_exposure_limit": 0,\n  "n_positions": 0\n}');

      return () =>
        h('div', { id: 'configs-editor' }, [
          h(BotSideEditor, {
            modelValue: longJson.value,
            'onUpdate:modelValue': (value: string) => (longJson.value = value),
            side: 'long',
            twe: '1',
            npos: '1',
            paramStatus: {},
          }),
          h(BotSideEditor, {
            modelValue: shortJson.value,
            'onUpdate:modelValue': (value: string) => (shortJson.value = value),
            side: 'short',
            twe: '0',
            npos: '0',
            paramStatus: shortParamStatus,
          }),
        ]);
    },
  });

  return mount(Harness, { global: { plugins: [createI18n('en')] } });
}

/** Focused behavior contracts for the Long/Short JSON disclosure panels. */
describe('BotSideEditor', () => {
  it('increments both PBv8 risk steppers repeatedly for long and short sides', async () => {
    const longJson = ref(JSON.stringify({ risk: { total_wallet_exposure_limit: 1, n_positions: 2 } }, null, 2));
    const shortJson = ref(JSON.stringify({ risk: { total_wallet_exposure_limit: 0.5, n_positions: 1 } }, null, 2));
    const longTwe = ref('1');
    const longNpos = ref('2');
    const shortTwe = ref('0.5');
    const shortNpos = ref('1');
    const Harness = defineComponent({
      setup() {
        return () => h('div', [
          h(BotSideEditor, {
            modelValue: longJson.value,
            'onUpdate:modelValue': (value: string) => (longJson.value = value),
            'onUpdate:twe': (value: string) => (longTwe.value = value),
            'onUpdate:npos': (value: string) => (longNpos.value = value),
            side: 'long',
            twe: longTwe.value,
            npos: longNpos.value,
            version: 'v8',
          }),
          h(BotSideEditor, {
            modelValue: shortJson.value,
            'onUpdate:modelValue': (value: string) => (shortJson.value = value),
            'onUpdate:twe': (value: string) => (shortTwe.value = value),
            'onUpdate:npos': (value: string) => (shortNpos.value = value),
            side: 'short',
            twe: shortTwe.value,
            npos: shortNpos.value,
            version: 'v8',
          }),
        ]);
      },
    });
    const wrapper = mount(Harness, { global: { plugins: [createI18n('en')] } });

    const longButtons = wrapper.get('[data-test="bot-side-long"]').findAll('.stepper-btn');
    const shortButtons = wrapper.get('[data-test="bot-side-short"]').findAll('.stepper-btn');
    await longButtons[1]!.trigger('click');
    await longButtons[1]!.trigger('click');
    await longButtons[3]!.trigger('click');
    await shortButtons[1]!.trigger('click');
    await shortButtons[1]!.trigger('click');
    await shortButtons[3]!.trigger('click');

    expect(JSON.parse(longJson.value)).toEqual({ risk: { total_wallet_exposure_limit: 1.1, n_positions: 3 } });
    expect(JSON.parse(shortJson.value)).toEqual({ risk: { total_wallet_exposure_limit: 0.6, n_positions: 2 } });
    expect(longTwe.value).toBe('1.1');
    expect(longNpos.value).toBe('3');
    expect(shortTwe.value).toBe('0.6');
    expect(shortNpos.value).toBe('2');
    wrapper.unmount();
  });

  it('uses the approved semantic hooks, aria-controls and independent per-side state', async () => {
    const wrapper = mountEditors({ strategy: 'pb_default' });
    const longPanel = wrapper.get('[data-test="bot-side-long"]');
    const shortPanel = wrapper.get('[data-test="bot-side-short"]');
    const longJson = longPanel.get('[data-test="bot-json-expander-long"]');
    const shortJson = shortPanel.get('[data-test="bot-json-expander-short"]');
    const longToggle = longJson.get('[data-test="bot-json-expander-toggle-long"]');
    const shortToggle = shortJson.get('[data-test="bot-json-expander-toggle-short"]');

    expect(longPanel.attributes('role')).toBe('region');
    expect(longPanel.attributes('aria-labelledby')).toBe('bot-side-title-long');
    expect(longPanel.find('.bot-side-head').exists()).toBe(true);
    expect(longPanel.find('.bot-side-title').exists()).toBe(true);
    expect(longPanel.get('.bot-side-direction').text()).toBe('Long');
    expect(longPanel.get('.bot-side-role').text()).toBe('LONG');
    expect(shortPanel.get('.bot-side-direction').text()).toBe('Short');
    expect(shortPanel.get('.bot-side-role').text()).toBe('SHORT');
    expect(longPanel.find('.bot-side-primary').exists()).toBe(true);
    expect(longPanel.findAll('.stepper-btn')).toHaveLength(4);
    expect(longPanel.findAll('.stepper-btn svg')).toHaveLength(4);
    expect(longPanel.find('.stepper-btn').attributes('aria-label')).toBe('Decrease total_wallet_exposure_limit');
    expect(longPanel.findAll('.stepper-btn')[1]!.attributes('aria-label')).toBe('Increase total_wallet_exposure_limit');

    expect(longToggle.attributes('aria-controls')).toBe('bot-json-content-long');
    expect(shortToggle.attributes('aria-controls')).toBe('bot-json-content-short');
    expect(longPanel.find('#bot-json-content-long').exists()).toBe(true);
    expect(shortPanel.find('#bot-json-content-short').exists()).toBe(true);
    expect(longToggle.get('.arrow').attributes('aria-hidden')).toBe('true');
    expect(shortToggle.get('.arrow').attributes('aria-hidden')).toBe('true');

    expect(shortJson.classes()).toContain('error');
    expect(shortToggle.get('.bot-json-review').text()).toBe('review');

    await longToggle.trigger('click');
    expect(longJson.classes()).toContain('open');
    expect(shortJson.classes()).not.toContain('open');
    expect(shortPanel.find('[data-test="cfg-bot-short"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps malformed JSON and its Review warning across close and reopen', async () => {
    const wrapper = mountEditors();
    const longPanel = wrapper.get('[data-test="bot-side-long"]');
    const longJson = longPanel.get('[data-test="bot-json-expander-long"]');
    const longToggle = longJson.get('[data-test="bot-json-expander-toggle-long"]');

    await longToggle.trigger('click');
    const textarea = longPanel.get('[data-test="cfg-bot-long"]');
    await textarea.setValue('{"risk":');
    await nextTick();
    await longToggle.trigger('click');

    expect(longJson.classes()).not.toContain('open');
    expect(longJson.classes()).toContain('error');
    expect(longToggle.get('.bot-json-review').text()).toBe('review');
    expect(longPanel.find('[data-test="cfg-bot-long"]').exists()).toBe(false);

    await longToggle.trigger('click');
    expect(longPanel.get<HTMLTextAreaElement>('[data-test="cfg-bot-long"]').element.value).toBe('{"risk":');

    await longPanel.get('[data-test="cfg-bot-long"]').setValue('[]');
    await longToggle.trigger('click');
    expect(longToggle.get('.bot-json-review').text()).toBe('review');
    wrapper.unmount();
  });
});
