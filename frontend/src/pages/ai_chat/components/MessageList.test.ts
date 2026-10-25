import { afterEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import MessageList from './MessageList.vue';
import type { ChatMessage } from '../composables/useAiChat';

const MESSAGES: ChatMessage[] = [
  { role: 'user', content: 'line one\nline two' },
  { role: 'assistant', content: 'Here is the plan.' },
];

function mountList(props: Partial<{ messages: ChatMessage[]; busy: boolean }> = {}, slots = {}) {
  return mount(MessageList, {
    props: { messages: MESSAGES, pendingMessage: '', busy: false, quickReplyAction: null, ...props },
    slots,
    global: { plugins: [createI18n('en')] },
    attachTo: document.body,
  });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
  document.body.innerHTML = '';
});

describe('MessageList', () => {
  it('keeps typed line breaks in user bubbles but not around rendered replies', () => {
    const wrapper = mountList();
    const [user, reply] = wrapper.findAll('[data-message-index]');

    expect(user!.classes()).toContain('items-end');
    expect(user!.find('.whitespace-pre-wrap').text()).toBe('line one\nline two');
    // Inherited pre-wrap turned every newline between rendered tags into a blank line.
    expect(reply!.find('.ai-markdown').text()).toBe('Here is the plan.');
    expect(reply!.find('.whitespace-pre-wrap').exists()).toBe(false);
  });

  it('puts icon actions under each message, with rewind only on user turns', async () => {
    const wrapper = mountList();
    const [user, reply] = wrapper.findAll('[data-message-index]');

    expect(user!.find('[data-test="message-copy"]').attributes('aria-label')).toBe('Copy');
    expect(user!.find('[data-test="message-rewind"]').attributes('aria-label')).toBe('Rewind');
    expect(reply!.find('[data-test="message-copy"]').exists()).toBe(true);
    expect(reply!.find('[data-test="message-rewind"]').exists()).toBe(false);

    await user!.find('[data-test="message-rewind"]').trigger('click');
    expect(wrapper.emitted('rewind')).toEqual([[0]]);
  });

  it('copies through the Clipboard API and confirms on the button', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const wrapper = mountList();
    const copy = wrapper.findAll('[data-test="message-copy"]')[1]!;

    await copy.trigger('click');
    await settle();

    expect(writeText).toHaveBeenCalledWith('Here is the plan.');
    expect(wrapper.emitted('copied')).toEqual([[true]]);
    expect(copy.attributes('title')).toBe('Message copied.');
  });

  it('falls back to execCommand where the Clipboard API is missing (plain-HTTP LAN access)', async () => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    const wrapper = mountList();

    await wrapper.findAll('[data-test="message-copy"]')[0]!.trigger('click');
    await settle();

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(wrapper.emitted('copied')).toEqual([[true]]);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports a failed copy without showing the confirmation', async () => {
    Object.defineProperty(document, 'execCommand', { value: vi.fn(() => false), configurable: true });
    const wrapper = mountList();
    const copy = wrapper.findAll('[data-test="message-copy"]')[0]!;

    await copy.trigger('click');
    await settle();

    expect(wrapper.emitted('copied')).toEqual([[false]]);
    expect(copy.attributes('title')).toBe('Copy');
  });

  it('shows the working dots only while a turn runs', async () => {
    const wrapper = mountList();
    expect(wrapper.find('[data-test="typing-indicator"]').exists()).toBe(false);

    await wrapper.setProps({ busy: true });
    expect(wrapper.find('[data-test="typing-indicator"]').attributes('aria-hidden')).toBe('true');
  });

  it('renders tail cards inside the scrolling transcript, after the messages', () => {
    const wrapper = mountList({}, { tail: () => h('div', { 'data-test': 'tail-card' }, 'approve me') });
    const scroller = wrapper.find('.overflow-y-auto');
    const tail = scroller.find('[data-test="tail-card"]');

    expect(tail.exists()).toBe(true);
    const last = scroller.findAll('[data-message-index]').at(-1)!.element;
    expect(last.compareDocumentPosition(tail.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
