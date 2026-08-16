import { describe, expect, it, vi } from 'vitest';
import { applyPlotlyFigure, clearPlotlyTarget, type PlotlyLike } from './heatmapFigure';

/* M-data-6 — legacy applyPlotlyFigure :8487-8498 and clearInventoryPlot
   :8474-8485. The port hardens the replace path: legacy wiped innerHTML
   and re-plotted (leaking the previous Plotly state); the wrapper now
   purges a plotted target BEFORE newPlot — the same purge contract
   clearInventoryPlot already used (:8477-8483). */

function makePlotly(): { plotly: PlotlyLike; calls: string[] } {
  const calls: string[] = [];
  const plotly: PlotlyLike = {
    newPlot: vi.fn(async (el: HTMLElement) => {
      calls.push('newPlot');
      (el as HTMLElement & { data?: unknown[] }).data = [{ type: 'bar' }]; // plotted marker
      return undefined;
    }),
    purge: vi.fn((el: HTMLElement) => {
      calls.push('purge');
      delete (el as HTMLElement & { data?: unknown[] }).data;
    }),
  };
  return { plotly, calls };
}

function makeDiv(): HTMLElement {
  return document.createElement('div');
}

const FIGURE = { data: [{ type: 'bar', x: [1], y: [2] }], layout: { title: 't' } };
const CONFIG = {
  displayModeBar: 'hover',
  responsive: true,
  scrollZoom: false,
  displaylogo: false,
};

describe('applyPlotlyFigure (:8487-8498)', () => {
  it('plots a figure object with the legacy config (:8492-8497)', async () => {
    const { plotly, calls } = makePlotly();
    const el = makeDiv();
    await applyPlotlyFigure(el, plotly, FIGURE);
    expect(calls).toEqual(['newPlot']);
    expect(plotly.newPlot).toHaveBeenCalledWith(el, FIGURE.data, FIGURE.layout, CONFIG);
    expect(el.innerHTML).toBe(''); // :8491 — cleared before plotting
  });

  it('parses a figure JSON string (:8490)', async () => {
    const { plotly } = makePlotly();
    const el = makeDiv();
    await applyPlotlyFigure(el, plotly, JSON.stringify(FIGURE));
    expect(plotly.newPlot).toHaveBeenCalledWith(el, FIGURE.data, FIGURE.layout, CONFIG);
  });

  it('purges a plotted target BEFORE replacing it (hardened R6)', async () => {
    const { plotly, calls } = makePlotly();
    const el = makeDiv();
    await applyPlotlyFigure(el, plotly, FIGURE);
    await applyPlotlyFigure(el, plotly, FIGURE);
    expect(calls).toEqual(['newPlot', 'purge', 'newPlot']);
  });

  it('purges even when the purge throws (:8478-8482)', async () => {
    const calls: string[] = [];
    const plotly: PlotlyLike = {
      newPlot: async () => {
        calls.push('newPlot');
        return undefined;
      },
      purge: () => {
        calls.push('purge');
        throw new Error('purge boom');
      },
    };
    const el = makeDiv() as HTMLElement & { data?: unknown[] };
    el.data = [];
    await expect(applyPlotlyFigure(el, plotly, FIGURE)).resolves.toBeUndefined();
    expect(calls).toEqual(['purge', 'newPlot']);
  });

  it('resolves without plotting when plotly is missing (:8489)', async () => {
    await expect(applyPlotlyFigure(makeDiv(), undefined, FIGURE)).resolves.toBeUndefined();
  });

  it('propagates figure JSON parse errors to the caller', async () => {
    const { plotly } = makePlotly();
    await expect(applyPlotlyFigure(makeDiv(), plotly, '{not json')).rejects.toBeInstanceOf(Error);
  });

  it('defaults missing data/layout to empty (:8492)', async () => {
    const { plotly } = makePlotly();
    const el = makeDiv();
    await applyPlotlyFigure(el, plotly, {});
    expect(plotly.newPlot).toHaveBeenCalledWith(el, [], {}, CONFIG);
  });
});

describe('clearPlotlyTarget (:8474-8485)', () => {
  it('purges a plotted target and shows the message (:8477-8484)', () => {
    const { plotly, calls } = makePlotly();
    const el = makeDiv();
    (el as HTMLElement & { data?: unknown[] }).data = [];
    clearPlotlyTarget(el, plotly, 'click a row');
    expect(calls).toEqual(['purge']);
    expect(el.textContent).toContain('click a row');
    expect(el.querySelector('.inventory-empty')).not.toBeNull();
  });

  it('skips the purge for unplotted targets (:8477)', () => {
    const { plotly, calls } = makePlotly();
    const el = makeDiv();
    clearPlotlyTarget(el, plotly, 'msg');
    expect(calls).toEqual([]);
    expect(el.textContent).toContain('msg');
  });

  it('defaults the message to market.noChart (:8484)', () => {
    const el = makeDiv();
    clearPlotlyTarget(el, undefined, '');
    expect(el.textContent).toContain('market.noChart');
  });

  it('is a no-op without plotly even when the target has stale data', () => {
    const el = makeDiv();
    (el as HTMLElement & { data?: unknown[] }).data = [];
    clearPlotlyTarget(el, undefined, 'm');
    expect(el.textContent).toContain('m');
  });
});
