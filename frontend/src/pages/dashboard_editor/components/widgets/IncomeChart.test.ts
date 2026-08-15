import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import IncomeChart from './IncomeChart.vue';
import PlotlyChart from './PlotlyChart.vue';
import { applyRangeZoom, incomeLayout, incomeTraces } from '../../lib/plotlyLayouts';
import { getSavedZoom, resetSavedZoom, savePlainZoom } from '../../lib/savedZoom';
import type { IncomeTrace } from '../../types/widgets';

/* IncomeChart — the chart half of the income widget (dashboard_render.js
 * 866-893 fast path + 1473-1579 _buildIncomeChart): per-symbol cumulative
 * scatter traces, zoom preserved across data updates, no-data state, and the
 * fullscreen target on .di-root (legacy gd.closest('.di-root'), render.js:1528). */

enableAutoUnmount(afterEach);

const TRACES: IncomeTrace[] = [
  { name: 'Total Income', x: ['2024-01-01 00:00:00', '2024-01-02 00:00:00'], y: [10, 25] },
  { name: 'BTC', x: ['2024-01-01 00:00:00'], y: [6] },
];

beforeEach(() => {
  resetSavedZoom();
});

afterEach(() => {
  resetSavedZoom();
});

function mountChart(traces: IncomeTrace[]): VueWrapper {
  return mount(IncomeChart, {
    props: { traces, height: null, pos: '1_2' },
  });
}

describe('IncomeChart', () => {
  it('renders the no-data state for empty traces (render.js:1475-1480)', () => {
    const wrapper = mountChart([]);
    expect(wrapper.get('.dt-nodata').text()).toBe('No data for the selected period.');
    expect(wrapper.findComponent(PlotlyChart).exists()).toBe(false);
  });

  it('feeds PlotlyChart the income trace/layout factories with zoom preservation', () => {
    const wrapper = mountChart(TRACES);
    const chart = wrapper.getComponent(PlotlyChart);
    expect(chart.props('traces')).toEqual(incomeTraces(TRACES));
    expect(chart.props('layout')).toEqual(incomeLayout(null));
    expect(chart.props('height')).toBeNull();
    expect(chart.props('zoomPos')).toBe('1_2');
    expect(chart.props('applyZoom')).toBe(applyRangeZoom);
    expect(chart.props('displayModeBar')).toBe(true);
    expect(chart.props('responsive')).toBe(true);
  });

  it("targets .di-root for fullscreen (legacy render.js:1528/1558 closest('.di-root'))", () => {
    const wrapper = mountChart(TRACES);
    expect(wrapper.getComponent(PlotlyChart).props('fullscreenRoot')).toBe('.di-root');
  });

  it('keeps a stored zoom when traces are replaced (fast path, render.js:878-889)', async () => {
    savePlainZoom('1_2', { xrange: [0, 5], yrange: null });
    const wrapper = mountChart(TRACES);
    await wrapper.setProps({ traces: [...TRACES, { name: 'ETH', x: ['2024-01-03 00:00:00'], y: [3] }] });
    expect(getSavedZoom('1_2')).toEqual({ xrange: [0, 5], yrange: null });
  });

  it('clears the zoom memory when the data comes back empty (legacy full rebuild wipes the chart)', async () => {
    savePlainZoom('1_2', { xrange: [0, 5], yrange: null });
    const wrapper = mountChart(TRACES);
    await wrapper.setProps({ traces: [] });
    expect(getSavedZoom('1_2')).toBeNull();
    expect(wrapper.get('.dt-nodata').text()).toBe('No data for the selected period.');
  });
});
