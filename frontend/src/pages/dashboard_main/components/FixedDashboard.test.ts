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
});
