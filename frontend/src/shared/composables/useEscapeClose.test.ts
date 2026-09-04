import { describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useEscapeClose } from './useEscapeClose';

function mountHarness(onEscape: () => void) {
  const active = ref(false);
  const Harness = defineComponent(() => {
    useEscapeClose(active, onEscape);
    return () => null;
  });
  const wrapper = mount(Harness);
  return { active, wrapper };
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

describe('useEscapeClose', () => {
  it('fires only while active', async () => {
    const onEscape = vi.fn();
    const { active, wrapper } = mountHarness(onEscape);

    pressEscape();
    expect(onEscape).not.toHaveBeenCalled();

    active.value = true;
    await nextTick();
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);

    active.value = false;
    await nextTick();
    pressEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('detaches on unmount while active', async () => {
    const onEscape = vi.fn();
    const { active, wrapper } = mountHarness(onEscape);

    active.value = true;
    await nextTick();
    wrapper.unmount();
    pressEscape();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('ignores non-Escape keys', async () => {
    const onEscape = vi.fn();
    const { active, wrapper } = mountHarness(onEscape);

    active.value = true;
    await nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onEscape).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
