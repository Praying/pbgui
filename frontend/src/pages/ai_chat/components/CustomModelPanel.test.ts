import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import CustomModelPanel from './CustomModelPanel.vue';
import type { CustomModel } from '../composables/useAiChat';

const model: CustomModel = {
  id: 'my-model',
  name: 'Mine',
  base_url: 'http://127.0.0.1:8000/v1',
  protocol: 'responses',
  context: 32768,
  output_limit: 4096,
  image_input: true,
  tools: true,
  reasoning_variants: [{ id: 'low' }, { id: 'high' }],
  has_key: true,
};

function mountPanel(models: CustomModel[] = [model]) {
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, messages: { en: {} } });
  return mount(CustomModelPanel, {
    props: { models, transitioning: false },
    global: { plugins: [i18n] },
  });
}

describe('AI chat custom model panel', () => {
  it('lists configured models with their protocol and endpoint, never a key', () => {
    const text = mountPanel().text();
    expect(text).toContain('Mine');
    expect(text).toContain('Responses');
    expect(text).toContain('http://127.0.0.1:8000/v1');
  });

  it('prefills the form from a model, leaves the key blank, and emits parsed thinking levels on save', async () => {
    const wrapper = mountPanel();
    const edit = wrapper.findAll('button').find((button) => button.text() === 'ai.chat.customEdit');
    await edit!.trigger('click');
    const inputs = wrapper.findAll('input');
    expect(inputs.some((input) => (input.element as HTMLInputElement).value === 'my-model')).toBe(true);
    expect(inputs.find((input) => input.attributes('type') === 'password')!.element.value).toBe('');
    await wrapper.get('form').trigger('submit');
    const [form, original] = wrapper.emitted('save')![0] as [Record<string, unknown>, string];
    expect(original).toBe('my-model');
    expect(form).toMatchObject({ model: 'my-model', protocol: 'responses', context: 32768, output_limit: 4096, image_input: true, reasoning_efforts: ['low', 'high'], api_key: '' });
  });

  it('shows the connection test outcome returned by the store', async () => {
    const wrapper = mountPanel([]);
    await wrapper.get('button').trigger('click');
    const test = wrapper.findAll('button').find((button) => button.text() === 'ai.chat.customTest');
    await test!.trigger('click');
    const [, , , done] = wrapper.emitted('test')![0] as [unknown, string, string, (r: unknown) => void];
    done({ ok: false, reply: '', error: 'bad key', url: '', protocol: 'chat', elapsed_seconds: 0.1 });
    await flushPromises();
    expect(wrapper.get('[data-testid="custom-test-result"]').text()).toContain('bad key');
  });
});
