import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { resetDashboardStore } from '@/pages/dashboard_editor/stores/dashboardStore';
import FixedDashboard from './FixedDashboard.vue';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ base_prefix: '', origin: 'http://pbgui.test:8000' }),
  wsOrigin: () => 'ws://pbgui.test:8000',
}));

vi.mock('@/pages/dashboard_editor/composables/useDashboardWs', () => ({
  useDashboardWs: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), rebuildCellsOfTypes: vi.fn() })),
}));

function widgetStub(name: string) {
  return { template: `<div data-widget="${name}" />` };
}

vi.mock('@/pages/dashboard_editor/components/widgets/WidgetAdg.vue', () => ({ default: widgetStub('adg') }));
vi.mock('@/pages/dashboard_editor/components/widgets/WidgetBalance.vue', () => ({ default: widgetStub('balance') }));
vi.mock('@/pages/dashboard_editor/components/widgets/WidgetIncome.vue', () => ({ default: widgetStub('income') }));
vi.mock('@/pages/dashboard_editor/components/widgets/WidgetPnl.vue', () => ({ default: widgetStub('pnl') }));
vi.mock('@/pages/dashboard_editor/components/widgets/WidgetPositions.vue', () => ({ default: widgetStub('positions') }));
vi.mock('@/pages/dashboard_editor/components/widgets/WidgetTop.vue', () => ({ default: widgetStub('top') }));

afterEach(() => {
  resetDashboardStore();
});

describe('FixedDashboard', () => {
  it('renders the approved fixed widget order', () => {
    const wrapper = mount(FixedDashboard, {
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.find('.overview-grid__balance').exists()).toBe(true);
    expect(wrapper.findAll('[data-widget="balance"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-widget="pnl"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-widget="adg"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-widget="positions"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-widget="income"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-widget="top"]')).toHaveLength(1);
    expect(wrapper.findAll('.overview-section-label')).toHaveLength(3);
  });

  it('uses the fixed live overview presentation', () => {
    const wrapper = mount(FixedDashboard, {
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.find('.dashboard-overview').exists()).toBe(true);
    expect(wrapper.find('.overview-rhythm').text()).toContain('Live');
    expect(wrapper.find('[data-test="shared-user-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="shared-period-selector"] .dt-ctrl-sel').exists()).toBe(true);
    expect(wrapper.find('[data-test="shared-mode-selector"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="shared-dashboard-filters"]')).toHaveLength(1);
    expect(wrapper.findAll('.msel-wrap')).toHaveLength(1);
  });

  it('keeps the workspace header as the only h1 and the overview copy in the hero', () => {
    const wrapper = mount(FixedDashboard, {
      global: { plugins: [createI18n('en')] },
    });

    // The workspace header owns the page h1; the hero is a section heading.
    expect(wrapper.find('.overview-intro h1').exists()).toBe(false);
    expect(wrapper.find('.overview-intro h2').exists()).toBe(true);
    expect(wrapper.find('.overview-copy').text()).toContain('A single live layout');
  });

  it('renders localized chart-mode labels and a localized live badge name', () => {
    const en = mount(FixedDashboard, {
      global: { plugins: [createI18n('en')] },
    });
    expect(en.find('[data-test="shared-mode-selector"]').text()).toContain('Bar');
    expect(en.find('.overview-rhythm').attributes('aria-label')).toBe('Live');

    const zh = mount(FixedDashboard, {
      global: { plugins: [createI18n('zh')] },
    });
    expect(zh.find('[data-test="shared-mode-selector"]').text()).toContain('柱状图');
  });

  it('keeps the action pills on one shared capsule rhythm', () => {
    const wrapper = mount(FixedDashboard, {
      global: { plugins: [createI18n('en')] },
    });

    // All three pills share the .overview-pill chrome (one padding/gap/height).
    expect(wrapper.findAll('.overview-pill')).toHaveLength(3);
    // The users label uses the same meta-label class as Period/Mode — the
    // nowrap + shrink-0 keeps MultiSelectDropdown's w-full from crushing it.
    expect(wrapper.find('.overview-user-filter .dt-meta-lbl').exists()).toBe(true);
    expect(wrapper.find('.overview-user-filter__label').exists()).toBe(false);
    // Mode label + select form one atomic unit that cannot wrap apart.
    expect(wrapper.find('.overview-filter-control [data-test="shared-mode-selector"]').exists()).toBe(true);
  });
});
