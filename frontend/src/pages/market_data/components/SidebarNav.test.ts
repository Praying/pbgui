import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import SidebarNav from './SidebarNav.vue';
import { PANELS } from '../composables/usePanels';

/* Sidebar shortcut wiring (legacy market_data_main.html:2946, :2948,
   :7415-7446, :9112-9120): the best-1m link opens the best1m panel in
   build mode, the l2books link (hyperliquid only) opens it in download
 * mode — the select payload carries the mode (M-data-1 review handoff). */

function mountNav(props: {
  active?: string;
  contextExchange?: string;
  best1mSection?: 'build' | 'download';
} = {}) {
  return mount(SidebarNav, {
    props: {
      panels: PANELS,
      active: (props.active ?? 'settings-panel') as never,
      contextExchange: props.contextExchange ?? 'hyperliquid',
      best1mSection: props.best1mSection ?? 'build',
    },
    global: { plugins: [createI18n('en')] },
  });
}

describe('best-1m shortcut link (:2946, :9112-9115)', () => {
  it('emits shortcut=build on click', async () => {
    const nav = mountNav();
    await nav.find('#sidebar-best-1m-link').trigger('click');
    expect(nav.emitted('shortcut')).toEqual([['build']]);
  });

  it('marks the link active while the best1m panel is open (:7435-7439)', () => {
    const nav = mountNav({ active: 'best1m-panel' });
    const link = nav.find('#sidebar-best-1m-link');
    expect(link.classes()).toContain('active');
    expect(link.attributes('aria-current')).toBe('page');
  });

  it('deactivates the link while another panel is open', () => {
    const nav = mountNav({ active: 'settings-panel' });
    const link = nav.find('#sidebar-best-1m-link');
    expect(link.classes()).not.toContain('active');
    expect(link.attributes('aria-current')).toBe('false');
  });
});

describe('l2books download shortcut (:2948, :7415-7425, :9117-9120)', () => {
  it('is visible only for hyperliquid (:7422)', () => {
    const visible = mountNav({ contextExchange: 'hyperliquid' });
    expect(visible.find('#sidebar-l2books-link').attributes('hidden')).toBeUndefined();

    const hidden = mountNav({ contextExchange: 'bybit' });
    expect(hidden.find('#sidebar-l2books-link').attributes('hidden')).toBeDefined();
  });

  it('emits shortcut=download on click', async () => {
    const nav = mountNav();
    await nav.find('#sidebar-l2books-link').trigger('click');
    expect(nav.emitted('shortcut')).toEqual([['download']]);
  });

  it('activates only when best1m is open on hyperliquid in download mode (:7440-7444)', () => {
    const active = mountNav({
      active: 'best1m-panel',
      contextExchange: 'hyperliquid',
      best1mSection: 'download',
    });
    expect(active.find('#sidebar-l2books-link').classes()).toContain('active');
    expect(active.find('#sidebar-l2books-link').attributes('aria-current')).toBe('page');
    expect(active.find('#sidebar-best-1m-link').classes()).not.toContain('active');

    const buildMode = mountNav({
      active: 'best1m-panel',
      contextExchange: 'hyperliquid',
      best1mSection: 'build',
    });
    expect(buildMode.find('#sidebar-l2books-link').classes()).not.toContain('active');
  });

  it('never activates off hyperliquid even in download mode', () => {
    const nav = mountNav({
      active: 'best1m-panel',
      contextExchange: 'bybit',
      best1mSection: 'download',
    });
    expect(nav.find('#sidebar-l2books-link').classes()).not.toContain('active');
    expect(nav.find('#sidebar-best-1m-link').classes()).toContain('active');
  });
});
