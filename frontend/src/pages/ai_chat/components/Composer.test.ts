import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import Composer from './Composer.vue';

/**
 * Enter is the send key, which collides with IME candidate commitment:
 * typing 你好 and pressing Enter to accept the candidate must not send.
 */
function mountComposer(props: Partial<{ enabled: boolean; busy: boolean; draft: string }> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });
  return mount(Composer, {
    props: { enabled: true, busy: false, draft: '', ...props },
    global: { plugins: [i18n], stubs: { PbIcon: true } },
    attachTo: document.body,
  });
}

function pressEnter(wrapper: ReturnType<typeof mountComposer>, init: KeyboardEventInit = {}) {
  const textarea = wrapper.get('textarea');
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    ...init,
  });
  textarea.element.dispatchEvent(event);
  return event;
}

describe('AI chat composer Enter handling', () => {
  it('sends on a plain Enter', async () => {
    const wrapper = mountComposer();
    pressEnter(wrapper);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('send')).toHaveLength(1);
  });

  it('does not send while an IME is composing', async () => {
    const wrapper = mountComposer();
    pressEnter(wrapper, { isComposing: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('send')).toBeUndefined();
  });

  it('does not send for the legacy keyCode 229 composition signal', async () => {
    // Safari and older Chromium report isComposing:false on the keydown that
    // ends composition but set keyCode 229.
    const wrapper = mountComposer();
    pressEnter(wrapper, { keyCode: 229 });
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('send')).toBeUndefined();
  });

  it('treats Shift+Enter as a newline, not a send', async () => {
    const wrapper = mountComposer();
    pressEnter(wrapper, { shiftKey: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('send')).toBeUndefined();
  });
});

describe('AI chat composer surface', () => {
  it('keeps the send button inert until a draft exists', async () => {
    const empty = mountComposer();
    expect(empty.get('#send').attributes('disabled')).toBeDefined();
    empty.unmount();

    const draft = mountComposer({ draft: 'hello' });
    expect(draft.get('#send').attributes('disabled')).toBeUndefined();
  });

  it('swaps Send for Stop while a turn runs', async () => {
    const wrapper = mountComposer({ busy: true, draft: 'hello' });
    expect(wrapper.find('#send').exists()).toBe(false);
    await wrapper.get('#stop').trigger('click');
    expect(wrapper.emitted('stop')).toHaveLength(1);
  });

  it('states the keyboard contract and disables the field without a provider', () => {
    const ready = mountComposer();
    expect(ready.text()).toContain('ai.chat.composerHint');
    ready.unmount();

    const blocked = mountComposer({ enabled: false });
    expect(blocked.text()).toContain('ai.chat.composerDisabledHint');
    expect(blocked.get('textarea').attributes('disabled')).toBeDefined();
  });

  it('counts down the remaining characters only near the limit', async () => {
    const wrapper = mountComposer();
    expect(wrapper.text()).not.toContain('ai.chat.composerCounter');

    await wrapper.setProps({ draft: 'x'.repeat(11_500) });
    expect(wrapper.text()).toContain('ai.chat.composerCounter');
  });

  it('grows with the draft up to the maximum height', async () => {
    const wrapper = mountComposer();
    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement;
    // jsdom reports 0 for scrollHeight, so the height stays at the grown value.
    Object.defineProperty(textarea, 'scrollHeight', { value: 96, configurable: true });
    await wrapper.setProps({ draft: 'first line\nsecond line' });
    await wrapper.vm.$nextTick();
    expect(textarea.style.height).toBe('96px');

    Object.defineProperty(textarea, 'scrollHeight', { value: 900, configurable: true });
    await wrapper.setProps({ draft: 'many\nlines\nhere' });
    await wrapper.vm.$nextTick();
    expect(textarea.style.height).toBe('180px');
  });
});
