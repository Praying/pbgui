import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhHouse, PhSparkle, PhWrench } from '@phosphor-icons/vue';
import { createI18n } from '@/shared/i18n';
import { WORKBENCH_NAVIGATION, type NavigationGroup, type NavigationItem } from '@/shared/navigation';
import WorkbenchRail from './WorkbenchRail.vue';

const EXPECTED_NAVIGATION_ROUTES = {
  '/': '/api/auth/main_page',
  dashboards: '/api/dashboard/main_page',
  help: '/api/help/main_page',
  info_ai_chat: '/api/ai/main_page',
  info_balance_calc: '/api/balance-calc/main_page',
  info_coin_data: '/api/coin-data/main_page',
  info_market_data_fastapi: '/api/market-data/main_page',
  system_api_keys: '/api/api-keys/main_page',
  system_profit_sweep: '/api/profit-sweep/main_page',
  system_cluster: '/api/cluster/main_page',
  system_db_tools: '/api/db-tools/main_page',
  system_logging: '/api/logging/main_page',
  system_services: '/api/services/main_page',
  system_vps_manager_fastapi: '/api/vps-manager/main_page',
  system_vps_monitor: '/api/vps/main_page',
  v7_backtest: '/api/backtest-v7/main_page',
  v7_optimize: '/api/optimize-v7/main_page',
  v7_pareto_explorer: '/api/pareto-explorer/main_page',
  v7_run: '/api/v7/main_page',
  v7_strategy_explorer: '/api/strategy-explorer/main_page',
  v8_backtest: '/api/backtest-v8/main_page',
  v8_optimize: '/api/optimize-v8/main_page',
  v8_pareto_explorer: '/api/pareto-explorer/main_page?optimize_version=v8',
  v8_run: '/api/v8/main_page',
  v8_strategy_explorer: '/api/strategy-explorer-v8/main_page',
} as const;

const TEST_GROUPS: readonly NavigationGroup[] = [
  {
    id: 'system',
    labelKey: 'nav.system',
    items: [
      {
        pageKey: '/',
        labelKey: 'nav.page./',
        href: '/api/auth/main_page',
        icon: PhHouse,
        groupId: 'system',
      },
      {
        pageKey: 'system_services',
        labelKey: 'nav.page.system_services',
        href: '/api/services/main_page',
        icon: PhWrench,
        groupId: 'system',
      },
      {
        pageKey: 'info_ai_chat',
        labelKey: 'nav.page.info_ai_chat',
        href: '/api/ai/main_page',
        icon: PhSparkle,
        groupId: 'system',
        disabled: true,
      },
    ],
  },
];

const TEST_SECTIONS = [
  { key: 'overview', label: 'Overview', tone: 'success' },
  { key: 'setup', label: 'Setup', tone: 'danger' },
  { key: 'credentials', label: 'Credentials' },
] as const;

function mountRail(
  activePage = 'system_services',
  collapsed = false,
  extraProps: Record<string, unknown> = {},
  attachToDocument = false,
) {
  return mount(WorkbenchRail, {
    props: {
      groups: TEST_GROUPS,
      activePage,
      collapsed,
      ...extraProps,
    },
    global: { plugins: [createI18n('en')] },
    attachTo: attachToDocument ? document.body : undefined,
  });
}

describe('WorkbenchRail', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('marks only the exact page key as active', () => {
    const wrapper = mountRail();
    const activeLink = wrapper.get('a[aria-current="page"]');

    expect(activeLink.attributes('href')).toBe('/api/services/main_page');
    expect(activeLink.text()).toContain('PBGUI Services');
    expect(wrapper.get('a[href="/api/auth/main_page"]').attributes('aria-current')).toBeUndefined();
  });

  it('preserves every legacy page key and destination', () => {
    const actualRoutes = Object.fromEntries(
      WORKBENCH_NAVIGATION.flatMap((group) =>
        group.items.map((item) => [item.pageKey, item.href]),
      ),
    );

    expect(actualRoutes).toEqual(EXPECTED_NAVIGATION_ROUTES);
  });

  it('renders disabled items as inert with an unavailable note', async () => {
    const wrapper = mountRail();
    const link = wrapper.get('a[aria-disabled="true"]');

    expect(link.attributes('href')).toBeUndefined();
    expect(link.classes()).toContain('workbench-rail__item--disabled');
    expect(link.attributes('title')).toBe('AI Chat — Unavailable');
    expect(link.attributes('aria-current')).toBeUndefined();

    // Collapsed-mode temp expansion never opens for a disabled item.
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    await link.element.dispatchEvent(event);

    expect(wrapper.find('.workbench-rail--temp-expanded').exists()).toBe(false);
  });

  it('disables the AI chat entry until its Vue page works', () => {
    const aiChat = WORKBENCH_NAVIGATION.flatMap(
      (group): NavigationItem[] => [...group.items],
    ).find((item) => item.pageKey === 'info_ai_chat');

    expect(aiChat?.disabled).toBe(true);
  });

  it('persists and emits the collapsed preference from mouse activation', async () => {
    const wrapper = mountRail();
    const toggle = wrapper.get('[data-testid="rail-toggle"]');

    expect(toggle.attributes('aria-expanded')).toBe('true');
    await toggle.trigger('click');

    expect(wrapper.emitted('update:collapsed')).toEqual([[true]]);
    expect(localStorage.getItem('pbgui-workbench-rail-collapsed')).toBe('true');
  });

  it('supports keyboard activation and exposes collapsed link names', async () => {
    const wrapper = mountRail('system_services', true);
    const toggle = wrapper.get('[data-testid="rail-toggle"]');

    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.attributes('aria-controls')).toBe('workbench-nav-list');
    expect(wrapper.get('nav#workbench-rail').attributes('aria-label')).toBe('Primary navigation');
    expect(wrapper.get('[data-testid="rail-compact-mark"]').text()).toBe('PB');
    expect(wrapper.get('a[href="/api/services/main_page"]').attributes('aria-label')).toBe(
      'PBGUI Services',
    );
    expect(wrapper.get('a[href="/api/services/main_page"]').attributes('title')).toBe(
      'System / PBGUI Services',
    );
    expect(wrapper.get('a[href="/api/services/main_page"] svg').attributes('width')).toBe('20');

    await toggle.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update:collapsed')).toEqual([[false]]);
    expect(localStorage.getItem('pbgui-workbench-rail-collapsed')).toBe('false');
  });

  it('keeps explicit expansion after the pointer leaves the rail', async () => {
    const wrapper = mountRail('system_services', true);
    const nav = wrapper.get('nav#workbench-rail');

    await wrapper.get('[data-testid="rail-toggle"]').trigger('click');
    await wrapper.setProps({ collapsed: false });

    expect(nav.classes()).not.toContain('workbench-rail--collapsed');
    expect(localStorage.getItem('pbgui-workbench-rail-collapsed')).toBe('false');

    document.body.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(nav.classes()).not.toContain('workbench-rail--collapsed');
    expect(nav.classes()).not.toContain('workbench-rail--temp-expanded');
  });

  it('keeps persistent expansion open after an outside pointerdown', async () => {
    const wrapper = mountRail('system_services', false, { sections: TEST_SECTIONS });
    const nav = wrapper.get('nav#workbench-rail');

    expect(nav.classes()).toContain('workbench-rail--floating-expanded');

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(nav.classes()).toContain('workbench-rail--floating-expanded');
    expect(nav.classes()).toContain('workbench-rail--persistent-expanded');
    expect(nav.classes()).not.toContain('workbench-rail--collapsed');
    expect(wrapper.emitted('update:collapsed')).toBeUndefined();
    expect(localStorage.getItem('pbgui-workbench-rail-collapsed')).toBeNull();
  });

  it('keeps persistent expansion open after Escape outside the rail', async () => {
    const wrapper = mountRail('system_services', false, { sections: TEST_SECTIONS }, true);
    const nav = wrapper.get('nav#workbench-rail');
    const outsideButton = document.createElement('button');
    document.body.append(outsideButton);
    outsideButton.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(nav.classes()).toContain('workbench-rail--floating-expanded');
    expect(nav.classes()).toContain('workbench-rail--persistent-expanded');
    expect(nav.classes()).not.toContain('workbench-rail--collapsed');
    const toggle = wrapper.get('[data-testid="rail-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(outsideButton);
    expect(wrapper.emitted('update:collapsed')).toBeUndefined();
    outsideButton.remove();
  });

  it('leaves Escape and focus with an active page dialog', async () => {
    const wrapper = mountRail('system_services', false, { sections: TEST_SECTIONS }, true);
    const nav = wrapper.get('nav#workbench-rail');
    const dialog = document.createElement('section');
    const dialogButton = document.createElement('button');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.append(dialogButton);
    document.body.append(dialog);
    dialogButton.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(nav.classes()).toContain('workbench-rail--floating-expanded');
    expect(nav.classes()).not.toContain('workbench-rail--collapsed');
    expect(document.activeElement).toBe(dialogButton);
    dialog.remove();
    wrapper.unmount();
  });

  it('leaves rail state and focus with an active page dialog on outside pointerdown', async () => {
    const wrapper = mountRail('system_services', false, { sections: TEST_SECTIONS }, true);
    const nav = wrapper.get('nav#workbench-rail');
    const dialog = document.createElement('section');
    const dialogButton = document.createElement('button');
    dialog.setAttribute('role', 'dialog');
    dialog.append(dialogButton);
    document.body.append(dialog);
    dialogButton.focus();

    try {
      dialogButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      await wrapper.vm.$nextTick();

      expect(nav.classes()).toContain('workbench-rail--floating-expanded');
      expect(nav.classes()).not.toContain('workbench-rail--collapsed');
      expect(document.activeElement).toBe(dialogButton);
    } finally {
      dialog.remove();
      wrapper.unmount();
    }
  });

  it('exposes modal drawer semantics only while expanded on mobile', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 720px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const wrapper = mountRail('system_services', true);
    const nav = wrapper.get('nav#workbench-rail');
    const appShell = document.createElement('div');
    const railSlot = document.createElement('div');
    const workspace = document.createElement('main');
    appShell.className = 'app-shell';
    railSlot.className = 'app-shell__rail-slot';
    workspace.className = 'app-shell__workspace';
    document.body.append(appShell);
    appShell.append(railSlot, workspace);
    railSlot.append(wrapper.element);

    expect(nav.attributes('role')).toBeUndefined();
    expect(nav.attributes('aria-modal')).toBeUndefined();
    expect(workspace.hasAttribute('inert')).toBe(false);

    await wrapper.get('[data-testid="rail-toggle"]').trigger('click');
    await wrapper.setProps({ collapsed: false });

    expect(nav.attributes('role')).toBe('dialog');
    expect(nav.attributes('aria-modal')).toBe('true');
    expect(workspace.hasAttribute('inert')).toBe(true);

    wrapper.unmount();
    expect(workspace.hasAttribute('inert')).toBe(false);
    appShell.remove();
    vi.unstubAllGlobals();
  });

  it('uses the accessible toggle to collapse persistent navigation', async () => {
    const wrapper = mountRail('system_services', false, { sections: TEST_SECTIONS });
    const toggle = wrapper.get('[data-testid="rail-toggle"]');

    await toggle.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update:collapsed')).toEqual([[true]]);
    expect(localStorage.getItem('pbgui-workbench-rail-collapsed')).toBe('true');
    expect(toggle.attributes('aria-label')).toBe('Collapse navigation');
  });

  it('dismisses temporary expansion with Escape from a focused rail item', async () => {
    const wrapper = mountRail('system_services', true, { sections: TEST_SECTIONS }, true);
    const nav = wrapper.get('nav#workbench-rail');
    const activeLink = wrapper.get('a[aria-current="page"]');

    await activeLink.trigger('click');
    expect(nav.classes()).toContain('workbench-rail--temp-expanded');

    const activeLinkElement = activeLink.element as HTMLAnchorElement;
    activeLinkElement.focus();
    expect(document.activeElement).toBe(activeLinkElement);
    activeLinkElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(nav.classes()).not.toContain('workbench-rail--temp-expanded');
    expect(nav.classes()).toContain('workbench-rail--collapsed');
  });

  it('labels the temporary expanded toggle as a collapse action', async () => {
    const wrapper = mountRail('system_services', true, { sections: TEST_SECTIONS });

    await wrapper.get('a[aria-current="page"]').trigger('click');

    const toggle = wrapper.get('[data-testid="rail-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.attributes('aria-label')).toBe('Collapse navigation');
    expect(toggle.attributes('title')).toBe('Collapse navigation');
  });

  it('renders section children only under the active page and emits selection', async () => {
    const wrapper = mountRail('system_services', false, {
      sections: TEST_SECTIONS,
      activeSection: 'overview',
    });

    const lists = wrapper.findAll('.workbench-rail__subitems');
    expect(lists).toHaveLength(1);

    const buttons = wrapper.findAll('.workbench-rail__subitem');
    expect(buttons.map((button) => button.text())).toEqual(['Overview', 'Setup', 'Credentials']);
    expect(buttons[0]!.classes()).toContain('workbench-rail__subitem--active');
    expect(buttons[0]!.attributes('aria-current')).toBe('location');
    expect(wrapper.find('.workbench-rail__subitem-dot[data-tone="success"]').exists()).toBe(true);
    expect(wrapper.find('.workbench-rail__subitem-dot[data-tone="danger"]').exists()).toBe(true);

    await buttons[1]!.trigger('click');

    expect(wrapper.emitted('update:section')).toEqual([['setup']]);
  });

  it('renders no section children when the page provides none', () => {
    const wrapper = mountRail();

    expect(wrapper.find('.workbench-rail__subitems').exists()).toBe(false);
  });

  it('temp-expands the collapsed rail from the active item, then collapses on selection', async () => {
    const wrapper = mountRail('system_services', true, {
      sections: TEST_SECTIONS,
      activeSection: 'overview',
    });
    const nav = wrapper.get('nav#workbench-rail');

    expect(nav.classes()).toContain('workbench-rail--collapsed');
    expect(wrapper.find('.workbench-rail__subitems').exists()).toBe(true);

    const activeLink = wrapper.get('a[aria-current="page"]');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    await activeLink.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(nav.classes()).toContain('workbench-rail--temp-expanded');
    expect(nav.classes()).not.toContain('workbench-rail--collapsed');
    expect(wrapper.find('.workbench-rail__brand-name').exists()).toBe(true);
    expect(wrapper.find('.workbench-rail__subitems').exists()).toBe(true);

    await wrapper.findAll('.workbench-rail__subitem')[1]!.trigger('click');

    expect(wrapper.emitted('update:section')).toEqual([['setup']]);
    expect(nav.classes()).not.toContain('workbench-rail--temp-expanded');
    expect(nav.classes()).toContain('workbench-rail--collapsed');
    expect(wrapper.find('.workbench-rail__subitems').exists()).toBe(true);
  });

  it('keeps non-active collapsed items as plain navigation links', async () => {
    const wrapper = mountRail('system_services', true, { sections: TEST_SECTIONS });

    const welcomeLink = wrapper.get('a[href="/api/auth/main_page"]');
    // Probe without the real destination: a non-prevented click would make
    // jsdom attempt an actual navigation and log noise.
    welcomeLink.element.removeAttribute('href');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    await welcomeLink.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.find('.workbench-rail--temp-expanded').exists()).toBe(false);
  });

  it('collapses the temporary expansion on an outside pointer press', async () => {
    const wrapper = mountRail('system_services', true, { sections: TEST_SECTIONS });
    const nav = wrapper.get('nav#workbench-rail');

    await wrapper.get('a[aria-current="page"]').trigger('click');
    expect(nav.classes()).toContain('workbench-rail--temp-expanded');

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(nav.classes()).not.toContain('workbench-rail--temp-expanded');
  });
});
