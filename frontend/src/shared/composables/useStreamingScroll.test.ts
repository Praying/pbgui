import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useStreamingScroll } from './useStreamingScroll';

/**
 * jsdom does not lay elements out, so scrollHeight/clientHeight/scrollTop
 * are plain numbers here. That is enough: the guard is arithmetic over
 * exactly those three values plus two clocks.
 */
function makeScroller({
  scrollHeight = 1000,
  clientHeight = 200,
  scrollTop = 800,
} = {}) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  el.scrollTop = scrollTop;
  return el;
}

function mountScroll() {
  let api!: ReturnType<typeof useStreamingScroll>;
  const Host = defineComponent({
    setup() {
      api = useStreamingScroll();
      return () => h('div');
    },
  });
  const wrapper = mount(Host, { attachTo: document.body });
  return { api, wrapper };
}

describe('useStreamingScroll', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('pins to the bottom when the view is already there', () => {
    const { api, wrapper } = mountScroll();
    const el = makeScroller({ scrollTop: 800 });
    api.attach(el);

    expect(api.pin(el)).toBe(true);
    expect(el.scrollTop).toBe(1000);
    wrapper.unmount();
  });

  it('leaves a reader who scrolled up alone', () => {
    const { api, wrapper } = mountScroll();
    const el = makeScroller({ scrollTop: 100 });
    api.attach(el);
    el.dispatchEvent(new Event('scroll'));
    // @scroll fires on the element, so give the handler its target.
    api.onScroll({ currentTarget: el } as unknown as Event);

    expect(api.isScrolledUp.value).toBe(true);
    expect(api.pin(el)).toBe(false);
    expect(el.scrollTop).toBe(100);
    wrapper.unmount();
  });

  it('backs off for the quiet window after a wheel gesture', () => {
    const { api, wrapper } = mountScroll();
    const el = makeScroller({ scrollTop: 800 });
    api.attach(el);

    // A wheel fires before the scroll position settles: still "at bottom"
    // by position, but the user has stated intent.
    el.dispatchEvent(new Event('wheel'));
    expect(api.pin(el)).toBe(false);
    wrapper.unmount();
  });

  it('resumes pinning once the quiet window passes', () => {
    vi.useFakeTimers();
    const { api, wrapper } = mountScroll();
    const el = makeScroller({ scrollTop: 800 });
    api.attach(el);

    el.dispatchEvent(new Event('wheel'));
    expect(api.pin(el)).toBe(false);

    vi.advanceTimersByTime(200);
    // Date.now() follows the fake clock, so the guard sees the gap.
    expect(api.pin(el)).toBe(true);
    expect(el.scrollTop).toBe(1000);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('always honours an explicit jump to the bottom', () => {
    const { api, wrapper } = mountScroll();
    const el = makeScroller({ scrollTop: 0 });
    api.attach(el);
    el.dispatchEvent(new Event('wheel'));

    api.scrollToBottom(el, false);
    expect(el.scrollTop).toBe(1000);
    expect(api.isScrolledUp.value).toBe(false);
    wrapper.unmount();
  });

  it('reports scrolled-up state from the scroll handler', async () => {
    const { api, wrapper } = mountScroll();
    const el = makeScroller({ scrollTop: 500 });
    api.attach(el);
    api.onScroll({ currentTarget: el } as unknown as Event);
    await nextTick();

    expect(api.atBottom.value).toBe(false);
    expect(api.isScrolledUp.value).toBe(true);
    wrapper.unmount();
  });

  it('detaches its listeners on unmount', () => {
    const { api, wrapper } = mountScroll();
    const el = makeScroller();
    const remove = vi.spyOn(el, 'removeEventListener');
    api.attach(el);
    wrapper.unmount();

    expect(remove).toHaveBeenCalledWith('wheel', expect.any(Function));
  });
});
