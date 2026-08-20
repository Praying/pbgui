import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DataTipTooltip from './DataTipTooltip.vue';

/* The data-tip tooltip mechanism (legacy market_data_main.html:3839-3865):
   document-delegated mouseover/mousemove/mouseout over any [data-tip]
   element, positioning with right/bottom edge flip. */

function tooltip(): HTMLElement {
  return document.getElementById('data-tip-tooltip') as HTMLElement;
}

function tipped(text: string): HTMLElement {
  const el = document.createElement('span');
  el.setAttribute('data-tip', text);
  document.body.appendChild(el);
  return el;
}

function dispatch(el: Element, type: 'mouseover' | 'mousemove' | 'mouseout', clientX = 100, clientY = 100): void {
  el.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX, clientY })
  );
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('data-tip tooltip (legacy :3839-3865)', () => {
  it('renders the #data-tip-tooltip element (:3637)', () => {
    mount(DataTipTooltip, { attachTo: document.body });
    expect(tooltip()).toBeInstanceOf(HTMLElement);
  });

  it('shows the tip text on mouseover of any [data-tip] element', () => {
    mount(DataTipTooltip, { attachTo: document.body });
    const el = tipped('Cycle interval hint');
    dispatch(el, 'mouseover');
    expect(tooltip().textContent).toBe('Cycle interval hint');
    expect(tooltip().style.display).toBe('block');
  });

  it('ignores elements without data-tip and empty tips (:3843-3846)', () => {
    mount(DataTipTooltip, { attachTo: document.body });
    const plain = document.createElement('span');
    document.body.appendChild(plain);
    dispatch(plain, 'mouseover');
    expect(tooltip().style.display).toBe('');

    const empty = tipped('');
    dispatch(empty, 'mouseover');
    expect(tooltip().style.display).toBe('');
  });

  it('matches the closest [data-tip] ancestor (delegation through children)', () => {
    mount(DataTipTooltip, { attachTo: document.body });
    const el = tipped('parent tip');
    const child = document.createElement('b');
    el.appendChild(child);
    dispatch(child, 'mouseover');
    expect(tooltip().textContent).toBe('parent tip');
  });

  it('positions at cursor + 14px while visible (:3852-3859)', () => {
    mount(DataTipTooltip, { attachTo: document.body });
    const el = tipped('tip');
    dispatch(el, 'mouseover');
    dispatch(el, 'mousemove', 200, 300);
    expect(tooltip().style.left).toBe('214px');
    expect(tooltip().style.top).toBe('314px');
  });

  it('flips left when the tip would overflow the right edge (:3856)', () => {
    mount(DataTipTooltip, { attachTo: document.body });
    Object.defineProperty(tooltip(), 'offsetWidth', { value: 600, configurable: true });
    Object.defineProperty(tooltip(), 'offsetHeight', { value: 20, configurable: true });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(300);
    const el = tipped('wide tip');
    dispatch(el, 'mouseover');
    dispatch(el, 'mousemove', 250, 50);
    expect(tooltip().style.left).toBe('-360px'); // 250 - 600 - 10
  });

  it('flips up when the tip would overflow the bottom edge (:3857)', () => {
    mount(DataTipTooltip, { attachTo: document.body });
    Object.defineProperty(tooltip(), 'offsetWidth', { value: 50, configurable: true });
    Object.defineProperty(tooltip(), 'offsetHeight', { value: 200, configurable: true });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(150);
    const el = tipped('tall tip');
    dispatch(el, 'mouseover');
    dispatch(el, 'mousemove', 20, 100);
    expect(tooltip().style.top).toBe('-110px'); // 100 - 200 - 10
  });

  it('hides on mouseout of the tipped element (:3861-3864)', () => {
    mount(DataTipTooltip, { attachTo: document.body });
    const el = tipped('bye');
    dispatch(el, 'mouseover');
    dispatch(el, 'mouseout');
    expect(tooltip().style.display).toBe('none');
  });

  it('stops listening after unmount (no leaked document handlers)', () => {
    const wrapper = mount(DataTipTooltip, { attachTo: document.body });
    wrapper.unmount();
    const el = tipped('ghost');
    dispatch(el, 'mouseover');
    expect(tooltip()).toBeNull(); // element gone with the component
  });
});
