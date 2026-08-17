import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  choosePlotRenderer,
  fitChartToWrap,
  fitRelayoutUpdate,
  fullscreenRelayoutUpdate,
  plotHasExistingPlot,
  relayoutFullscreenChart,
  rememberChartHeight,
  useFullscreenRelayout,
} from './useChartState';
import type { PlotlyVendor } from '../lib/plotlyVendor';

/*
 * Pareto chart plumbing — the react-vs-newPlot decision (:2313),
 * rememberChartHeight (:2689-2702), the fullscreen relayout (:2723-2779) and
 * fitChartToWrap (:2750-2766). Plotly fast paths must survive the port (R5).
 */

type ChartDom = HTMLElement & { data?: unknown; layout?: { height?: unknown }; on?: (e: string, h: unknown) => void };

function chartFixture(height?: number): { wrap: HTMLElement; chart: ChartDom } {
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const chart = document.createElement('div') as ChartDom;
  chart.id = 'playground-chart';
  wrap.appendChild(chart);
  document.body.appendChild(wrap);
  if (height != null) chart.layout = { height };
  return { wrap, chart };
}

function plotlyStub(): PlotlyVendor & { relayoutCalls: unknown[][]; resizeCalls: HTMLElement[] } {
  const relayoutCalls: unknown[][] = [];
  const resizeCalls: HTMLElement[] = [];
  const vendor: PlotlyVendor & { relayoutCalls: unknown[][]; resizeCalls: HTMLElement[] } = {
    react: vi.fn(),
    newPlot: vi.fn(),
    relayout: (el: HTMLElement, updates: Record<string, unknown>) => {
      relayoutCalls.push([el, updates]);
      return Promise.resolve();
    },
    restyle: vi.fn(),
    purge: vi.fn(),
    Plots: { resize: (el: HTMLElement) => resizeCalls.push(el) },
    relayoutCalls,
    resizeCalls,
  };
  return vendor;
}

function setFullscreenElement(el: HTMLElement | null): void {
  Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
}

afterEach(() => {
  setFullscreenElement(null);
  document.body.innerHTML = '';
});

describe('plotHasExistingPlot / choosePlotRenderer (:2295, :2313)', () => {
  it('uses react only when the node already hosts a plot AND Plotly.react exists', () => {
    const plotly = plotlyStub();
    const { chart } = chartFixture();
    expect(choosePlotRenderer(chart, plotly)).toBe('newPlot');
    chart.data = [{ x: [] }];
    chart.layout = {};
    expect(plotHasExistingPlot(chart)).toBe(true);
    expect(choosePlotRenderer(chart, plotly)).toBe('react');
    expect(choosePlotRenderer(chart, undefined)).toBe('newPlot');
  });

  it('detects a rendered plot container even without data/layout', () => {
    const { chart } = chartFixture();
    const container = document.createElement('div');
    container.className = 'plot-container';
    chart.appendChild(container);
    expect(plotHasExistingPlot(chart)).toBe(true);
  });
});

describe('rememberChartHeight (:2689-2702)', () => {
  it('persists the layout height onto the wrap and node', () => {
    const { wrap, chart } = chartFixture(640);
    expect(rememberChartHeight(chart)).toBe(640);
    expect(wrap.dataset.restoreHeight).toBe('640');
    expect(wrap.style.height).toBe('640px');
    expect(chart.style.height).toBe('640px');
  });

  it('falls back to the measured offset height', () => {
    const { wrap, chart } = chartFixture();
    Object.defineProperty(chart, 'offsetHeight', { value: 410, configurable: true });
    expect(rememberChartHeight(chart)).toBe(410);
    expect(wrap.dataset.restoreHeight).toBe('410');
  });

  it('is a no-op outside a chart wrap or without any height', () => {
    const orphan = document.createElement('div') as ChartDom;
    expect(rememberChartHeight(orphan)).toBe(0);
    const { chart } = chartFixture(0);
    expect(rememberChartHeight(chart)).toBe(0);
  });
});

describe('fullscreen relayout (:2723-2779)', () => {
  it('enters fullscreen unbounded and restores the remembered height on exit', () => {
    expect(fullscreenRelayoutUpdate(true, 640)).toEqual({ autosize: true, width: null, height: null });
    expect(fullscreenRelayoutUpdate(false, 640)).toEqual({ autosize: true, width: null, height: 640 });
    expect(fullscreenRelayoutUpdate(false, 0)).toEqual({ autosize: true, width: null, height: null });
  });

  it('relayoutFullscreenChart clears heights entering and restores leaving', async () => {
    const plotly = plotlyStub();
    const { wrap, chart } = chartFixture(560);
    rememberChartHeight(chart);
    setFullscreenElement(wrap);
    relayoutFullscreenChart(plotly, wrap);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(wrap.style.height).toBe('');
    expect(plotly.relayoutCalls.at(-1)![1]).toEqual({ autosize: true, width: null, height: null });

    setFullscreenElement(null);
    relayoutFullscreenChart(plotly, wrap);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(wrap.style.height).toBe('560px');
    expect(chart.style.height).toBe('560px');
    expect(plotly.relayoutCalls.at(-1)![1]).toEqual({ autosize: true, width: null, height: 560 });
  });

  it('ignores wraps that are not .chart-wrap', async () => {
    const plotly = plotlyStub();
    const stranger = document.createElement('div');
    relayoutFullscreenChart(plotly, stranger);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(plotly.relayoutCalls).toHaveLength(0);
  });

  it('useFullscreenRelayout tracks the active wrap across enter/exit', async () => {
    const plotly = plotlyStub();
    const { wrap, chart } = chartFixture(500);
    rememberChartHeight(chart);
    const listener = useFullscreenRelayout(() => plotly);
    listener.install();
    setFullscreenElement(wrap);
    document.dispatchEvent(new Event('fullscreenchange'));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(plotly.relayoutCalls.length).toBeGreaterThan(0);
    setFullscreenElement(null);
    document.dispatchEvent(new Event('fullscreenchange'));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(wrap.style.height).toBe('500px');
    listener.dispose();
  });
});

describe('fitChartToWrap (:2750-2766)', () => {
  it('relayouts to the wrap height without re-plotting', async () => {
    const plotly = plotlyStub();
    const { wrap, chart } = chartFixture();
    Object.defineProperty(wrap, 'clientHeight', { value: 430, configurable: true });
    fitChartToWrap(plotly, chart);
    expect(chart.style.height).toBe('430px');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(plotly.relayoutCalls).toHaveLength(1);
    expect(plotly.relayoutCalls[0]![1]).toEqual(fitRelayoutUpdate(430));
    expect(plotly.resizeCalls[0]).toBe(chart);
  });

  it('still relayouts (height null) when the wrap has no measurable height (:2756-2763)', async () => {
    const plotly = plotlyStub();
    const { chart } = chartFixture();
    fitChartToWrap(plotly, chart);
    expect(chart.style.height).toBe(''); // no style write without a height
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(plotly.relayoutCalls).toHaveLength(1);
    expect(plotly.relayoutCalls[0]![1]).toEqual({ autosize: true, width: null, height: null });
  });
});
