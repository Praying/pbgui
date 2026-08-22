import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { PhHouse, PhWrench } from '@phosphor-icons/vue';
import { createI18n } from '@/shared/i18n';
import { WORKBENCH_NAVIGATION, type NavigationGroup } from '@/shared/navigation';
import WorkbenchRail from './WorkbenchRail.vue';

const EXPECTED_NAVIGATION_ROUTES = {
  '/': '/api/auth/main_page',
  dashboards: '/api/dashboard/main_page',
  help: '/api/help/main_page',
  info_balance_calc: '/api/balance-calc/main_page',
  info_coin_data: '/api/coin-data/main_page',
  info_market_data_fastapi: '/api/market-data/main_page',
  system_api_keys: '/api/api-keys/main_page',
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
    ],
  },
];

function mountRail(activePage = 'system_services', collapsed = false) {
  return mount(WorkbenchRail, {
    props: {
      groups: TEST_GROUPS,
      activePage,
      collapsed,
    },
    global: { plugins: [createI18n('en')] },
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
    expect(wrapper.get('a[href="/api/services/main_page"]').attributes('title')).toBe('PBGUI Services');

    await toggle.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update:collapsed')).toEqual([[false]]);
    expect(localStorage.getItem('pbgui-workbench-rail-collapsed')).toBe('false');
  });
});
