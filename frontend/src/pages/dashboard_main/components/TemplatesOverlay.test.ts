import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import TemplatesOverlay from './TemplatesOverlay.vue';

enableAutoUnmount(afterEach);

// Attached to the document body: jsdom's getComputedStyle only resolves
// inline styles (v-show) reliably for connected elements.
const hosts: HTMLElement[] = [];

function mountOverlay(props: { visible?: boolean; url?: string } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  return mount(TemplatesOverlay, {
    props: { visible: false, url: '', ...props },
    global: { plugins: [createI18n('en')] },
    attachTo: host,
  });
}

describe('TemplatesOverlay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is hidden until visible', () => {
    const wrapper = mountOverlay();

    expect(wrapper.find('#tpl-overlay').isVisible()).toBe(false);
  });

  it('renders the iframe with the given url when visible', () => {
    const wrapper = mountOverlay({ visible: true, url: 'http://pbgui.test/api/dashboard/templates_page' });

    expect(wrapper.find('#tpl-overlay').isVisible()).toBe(true);
    expect(wrapper.find('#tpl-iframe').attributes('src')).toBe(
      'http://pbgui.test/api/dashboard/templates_page'
    );
  });

  it('emits close from the close button', async () => {
    const wrapper = mountOverlay({ visible: true, url: 'http://x/' });

    await wrapper.find('#tpl-close-btn').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('moves the overlay while dragging the handle', async () => {
    const wrapper = mountOverlay({ visible: true, url: 'http://x/' });
    const overlay = wrapper.find('#tpl-overlay').element as HTMLElement;
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 200,
      right: 800,
      bottom: 940,
      width: 700,
      height: 740,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect);

    await wrapper.find('#tpl-drag-handle').trigger('mousedown', { clientX: 300, clientY: 400 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 340, clientY: 430, bubbles: true }));

    expect(overlay.style.transform).toBe('none');
    expect(overlay.style.left).toBe('140px');
    expect(overlay.style.top).toBe('230px');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 500, bubbles: true }));

    expect(overlay.style.left).toBe('140px'); // no movement after mouseup
  });
});
