import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue';
import { mount } from '@vue/test-utils';
import { vFocusTrap } from './focusTrap';

const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

function mountDialog(opts: { open?: boolean; trap?: boolean } = {}) {
  const open = ref(opts.open ?? true);
  const trap = ref(opts.trap ?? true);
  const Host = defineComponent({
    setup() {
      return () =>
        h('div', [
          h('button', { id: 'opener' }, 'open'),
          open.value
            ? withDirectives(
                h('div', { id: 'dlg', role: 'dialog' }, [
                  h('button', { id: 'a' }, 'a'),
                  h('input', { id: 'b' }),
                  h('button', { id: 'c' }, 'c'),
                ]),
                [[vFocusTrap, trap.value]],
              )
            : null,
        ]);
    },
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  const wrapper = mount(Host, { attachTo: host });
  return { wrapper, open, trap };
}

function tab(el: Element, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

describe('v-focus-trap', () => {
  it('moves focus into the dialog on mount', async () => {
    const { wrapper } = mountDialog();
    await nextTick();
    await Promise.resolve();
    expect(document.activeElement?.id).toBe('a');
    wrapper.unmount();
  });

  it('makes the dialog itself focusable', () => {
    const { wrapper } = mountDialog();
    expect(wrapper.get('#dlg').attributes('tabindex')).toBe('-1');
    wrapper.unmount();
  });

  it('wraps Tab from the last control to the first', async () => {
    const { wrapper } = mountDialog();
    await Promise.resolve();
    const last = wrapper.get('#c').element as HTMLElement;
    last.focus();
    const event = tab(last);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('a');
    wrapper.unmount();
  });

  it('wraps Shift+Tab from the first control to the last', async () => {
    const { wrapper } = mountDialog();
    await Promise.resolve();
    const first = wrapper.get('#a').element as HTMLElement;
    first.focus();
    const event = tab(first, true);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('c');
    wrapper.unmount();
  });

  it('leaves Tab alone between controls', async () => {
    const { wrapper } = mountDialog();
    await Promise.resolve();
    const middle = wrapper.get('#b').element as HTMLElement;
    middle.focus();
    expect(tab(middle).defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it('restores focus to the opener when the dialog closes', async () => {
    const { wrapper, open } = mountDialog({ open: false });
    const opener = wrapper.get('#opener').element as HTMLElement;
    opener.focus();
    open.value = true;
    await nextTick();
    await Promise.resolve();
    expect(document.activeElement?.id).toBe('a');

    open.value = false;
    await nextTick();
    expect(document.activeElement?.id).toBe('opener');
    wrapper.unmount();
  });

  it('does nothing when disabled with false', async () => {
    const { wrapper } = mountDialog({ trap: false });
    await Promise.resolve();
    expect(wrapper.get('#dlg').attributes('tabindex')).toBeUndefined();
    expect(document.activeElement?.id).not.toBe('a');
    wrapper.unmount();
  });
});
