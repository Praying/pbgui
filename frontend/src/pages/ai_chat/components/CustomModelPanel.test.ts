import { afterEach, describe, expect, it } from 'vitest';
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
    attachTo: document.body,
  });
}

/* The editor is the shared Modal, which portals to <body>: assert through
   document like Modal.test.ts does, and wait for reka's Presence frame.
   Nothing unmounts the portal here, so every case starts from an empty body
   or it would read the previous case's dialog. */
afterEach(() => {
  document.body.innerHTML = '';
});

async function openDialog(): Promise<HTMLElement> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error('editor dialog did not open');
  return dialog;
}

/* The Save button lives in the dialog footer with form="custom-model-form";
   jsdom does not run the implicit submission a browser does for that, so the
   form's submit event is the contract under test here. */
function submit(dialog: HTMLElement): void {
  dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function buttonByText(dialog: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(dialog.querySelectorAll('button')).find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`no button labelled ${text}`);
  return button;
}

describe('AI chat custom model panel', () => {
  it('summarises a configured model without ever rendering its key', () => {
    const wrapper = mountPanel();
    const card = wrapper.get('[data-testid="custom-model-my-model"]');
    const text = card.text();

    expect(text).toContain('Mine');
    expect(text).toContain('ai.chat.customProtocolResponses');
    // Scheme stripped: the card shows the host path, not a full clickable URL.
    expect(text).toContain('127.0.0.1:8000/v1');
    expect(text).not.toContain('http://');
    // Capability chips: context size, images, tools, thinking levels.
    expect(text).toContain('33k');  // 32768 tokens rounded to the nearest thousand
    expect(text).toContain('ai.chat.customTagImages');
    expect(text).toContain('ai.chat.customTagTools');
    expect(text).toContain('ai.chat.customTagEfforts');
    expect(card.html()).not.toContain('sk-');
  });

  it('opens the editor from the card with the model prefilled and the key blank', async () => {
    const wrapper = mountPanel();
    await wrapper.get('[data-testid="custom-model-my-model"]').trigger('click');
    const dialog = await openDialog();
    const inputs = Array.from(dialog.querySelectorAll('input'));

    expect(inputs.some((input) => input.value === 'my-model')).toBe(true);
    expect(inputs.find((input) => input.type === 'password')!.value).toBe('');
  });

  it('emits the parsed thinking levels when the editor saves', async () => {
    const wrapper = mountPanel();
    await wrapper.get('[data-testid="custom-model-my-model"]').trigger('click');
    const dialog = await openDialog();

    submit(dialog);
    await flushPromises();

    const [submitted, original] = wrapper.emitted('save')![0] as [Record<string, unknown>, string];
    expect(original).toBe('my-model');
    expect(submitted).toMatchObject({
      model: 'my-model',
      protocol: 'responses',
      context: 32768,
      output_limit: 4096,
      image_input: true,
      reasoning_efforts: ['low', 'high'],
      api_key: '',
    });
  });

  it('adds a model from the panel button with an empty form', async () => {
    const wrapper = mountPanel([]);
    await wrapper.get('button').trigger('click');
    const dialog = await openDialog();

    submit(dialog);
    await flushPromises();

    const [submitted, original] = wrapper.emitted('save')![0] as [Record<string, unknown>, string];
    expect(original).toBe('');
    expect(submitted).toMatchObject({ model: '', base_url: '', api_key: '' });
  });

  it('shows the connection test outcome returned by the store', async () => {
    const wrapper = mountPanel([]);
    await wrapper.get('button').trigger('click');
    const dialog = await openDialog();

    buttonByText(dialog, 'ai.chat.customTest').click();
    await flushPromises();
    const [, , , done] = wrapper.emitted('test')![0] as [unknown, string, string, (r: unknown) => void];
    done({ ok: false, reply: '', error: 'bad key', url: '', protocol: 'chat', elapsed_seconds: 0.1 });
    await flushPromises();

    expect(dialog.querySelector('[data-testid="custom-test-result"]')?.textContent).toContain('bad key');
  });

  it('offers removal only when editing a stored model', async () => {
    const adding = mountPanel([]);
    await adding.get('button').trigger('click');
    const addDialog = await openDialog();
    expect(Array.from(addDialog.querySelectorAll('button')).some((item) => item.textContent?.trim() === 'ai.chat.customDelete')).toBe(false);
    adding.unmount();
    document.body.innerHTML = '';

    const editing = mountPanel();
    await editing.get('[data-testid="custom-model-my-model"]').trigger('click');
    const editDialog = await openDialog();
    expect(Array.from(editDialog.querySelectorAll('button')).some((item) => item.textContent?.trim() === 'ai.chat.customDelete')).toBe(true);
  });
});
