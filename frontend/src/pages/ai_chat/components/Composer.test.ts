import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import Composer from './Composer.vue';

/**
 * Enter is the send key, which collides with IME candidate commitment:
 * typing 你好 and pressing Enter to accept the candidate must not send.
 */
function mountComposer() {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });
  return mount(Composer, {
    props: { enabled: true, busy: false, draft: '' },
    global: { plugins: [i18n], stubs: { PbIcon: true } },
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
