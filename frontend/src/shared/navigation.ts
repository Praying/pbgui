import type { Component } from 'vue';
import {
  PhActivity,
  PhArrowsClockwise,
  PhChartBar,
  PhChartLine,
  PhChartLineUp,
  PhClockCounterClockwise,
  PhCoin,
  PhDatabase,
  PhDesktop,
  PhEye,
  PhFileText,
  PhHouse,
  PhKey,
  PhPlay,
  PhQuestion,
  PhSparkle,
  PhTarget,
  PhWallet,
  PhWrench,
} from '@phosphor-icons/vue';

export interface NavigationItem {
  pageKey: string;
  labelKey: string;
  href: string;
  icon: Component;
  groupId: string;
}

export interface NavigationGroup {
  id: string;
  labelKey: string;
  items: readonly NavigationItem[];
}

export type SectionTone = 'neutral' | 'success' | 'warning' | 'danger';

/** Page-internal section exposed as rail children under the active page. */
export interface PageSection {
  key: string;
  /** Already-translated label — pages own their i18n, like pageTitle. */
  label: string;
  /** Optional live-status dot tone (e.g. services_monitor panel health). */
  tone?: SectionTone;
  /** Optional trailing count badge (e.g. queue length). */
  badge?: string;
  /** Disabled sections stay visible but inert (e.g. password before login). */
  disabled?: boolean;
}

export const WORKBENCH_NAVIGATION = [
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
        pageKey: 'system_api_keys',
        labelKey: 'nav.page.system_api_keys',
        href: '/api/api-keys/main_page',
        icon: PhKey,
        groupId: 'system',
      },
      {
        pageKey: 'system_cluster',
        labelKey: 'nav.page.system_cluster',
        href: '/api/cluster/main_page',
        icon: PhArrowsClockwise,
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
        pageKey: 'system_db_tools',
        labelKey: 'nav.page.system_db_tools',
        href: '/api/db-tools/main_page',
        icon: PhDatabase,
        groupId: 'system',
      },
      {
        pageKey: 'system_vps_manager_fastapi',
        labelKey: 'nav.page.system_vps_manager_fastapi',
        href: '/api/vps-manager/main_page',
        icon: PhDesktop,
        groupId: 'system',
      },
      {
        pageKey: 'system_vps_monitor',
        labelKey: 'nav.page.system_vps_monitor',
        href: '/api/vps/main_page',
        icon: PhActivity,
        groupId: 'system',
      },
      {
        pageKey: 'system_logging',
        labelKey: 'nav.page.system_logging',
        href: '/api/logging/main_page',
        icon: PhFileText,
        groupId: 'system',
      },
    ],
  },
  {
    id: 'information',
    labelKey: 'nav.information',
    items: [
      {
        pageKey: 'dashboards',
        labelKey: 'nav.page.dashboards',
        href: '/api/dashboard/main_page',
        icon: PhChartBar,
        groupId: 'information',
      },
      {
        pageKey: 'info_coin_data',
        labelKey: 'nav.page.info_coin_data',
        href: '/api/coin-data/main_page',
        icon: PhCoin,
        groupId: 'information',
      },
      {
        pageKey: 'info_market_data_fastapi',
        labelKey: 'nav.page.info_market_data_fastapi',
        href: '/api/market-data/main_page',
        icon: PhChartLine,
        groupId: 'information',
      },
      {
        pageKey: 'info_balance_calc',
        labelKey: 'nav.page.info_balance_calc',
        href: '/api/balance-calc/main_page',
        icon: PhWallet,
        groupId: 'information',
      },
      {
        pageKey: 'info_ai_chat',
        labelKey: 'nav.page.info_ai_chat',
        href: '/api/ai/main_page',
        icon: PhSparkle,
        groupId: 'information',
      },
      {
        pageKey: 'help',
        labelKey: 'nav.page.help',
        href: '/api/help/main_page',
        icon: PhQuestion,
        groupId: 'information',
      },
    ],
  },
  {
    id: 'pbv7',
    labelKey: 'nav.pbv7',
    items: [
      {
        pageKey: 'v7_run',
        labelKey: 'nav.page.v7_run',
        href: '/api/v7/main_page',
        icon: PhPlay,
        groupId: 'pbv7',
      },
      {
        pageKey: 'v7_backtest',
        labelKey: 'nav.page.v7_backtest',
        href: '/api/backtest-v7/main_page',
        icon: PhClockCounterClockwise,
        groupId: 'pbv7',
      },
      {
        pageKey: 'v7_optimize',
        labelKey: 'nav.page.v7_optimize',
        href: '/api/optimize-v7/main_page',
        icon: PhChartLineUp,
        groupId: 'pbv7',
      },
      {
        pageKey: 'v7_strategy_explorer',
        labelKey: 'nav.page.v7_strategy_explorer',
        href: '/api/strategy-explorer/main_page',
        icon: PhEye,
        groupId: 'pbv7',
      },
      {
        pageKey: 'v7_pareto_explorer',
        labelKey: 'nav.page.v7_pareto_explorer',
        href: '/api/pareto-explorer/main_page',
        icon: PhTarget,
        groupId: 'pbv7',
      },
    ],
  },
  {
    id: 'pbv8',
    labelKey: 'nav.pbv8',
    items: [
      {
        pageKey: 'v8_run',
        labelKey: 'nav.page.v8_run',
        href: '/api/v8/main_page',
        icon: PhPlay,
        groupId: 'pbv8',
      },
      {
        pageKey: 'v8_backtest',
        labelKey: 'nav.page.v8_backtest',
        href: '/api/backtest-v8/main_page',
        icon: PhClockCounterClockwise,
        groupId: 'pbv8',
      },
      {
        pageKey: 'v8_optimize',
        labelKey: 'nav.page.v8_optimize',
        href: '/api/optimize-v8/main_page',
        icon: PhChartLineUp,
        groupId: 'pbv8',
      },
      {
        pageKey: 'v8_strategy_explorer',
        labelKey: 'nav.page.v8_strategy_explorer',
        href: '/api/strategy-explorer-v8/main_page',
        icon: PhEye,
        groupId: 'pbv8',
      },
      {
        pageKey: 'v8_pareto_explorer',
        labelKey: 'nav.page.v8_pareto_explorer',
        href: '/api/pareto-explorer/main_page?optimize_version=v8',
        icon: PhTarget,
        groupId: 'pbv8',
      },
    ],
  },
] as const satisfies readonly NavigationGroup[];
