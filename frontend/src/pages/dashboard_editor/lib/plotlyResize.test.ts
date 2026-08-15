import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resizePlotsInCell, type PlotlyGlobal } from './plotlyResize';

/* Port of buildGrid's resizePlotsInCell (dashboard_editor.html:2379-2409). */

interface FakeEl {
  style: Record<string, string>;
  querySelectorAll: ReturnType<typeof vi.fn>;
  querySelector: ReturnType<typeof vi.fn>;
  closest: ReturnType<typeof vi.fn>;
  getBoundingClientRect: ReturnType<typeof vi.fn>;
}

function fakeEl(): FakeEl {
  return {
    style: {},
    querySelectorAll: vi.fn().mockReturnValue([]),
    querySelector: vi.fn().mockReturnValue(null),
    closest: vi.fn().mockReturnValue(null),
    getBoundingClientRect: vi.fn().mockReturnValue({ height: 0 }),
  };
}

const relayout = vi.fn();
const plotsResize = vi.fn();

function installPlotly(): void {
  (window as unknown as { Plotly: PlotlyGlobal }).Plotly = {
    relayout,
    Plots: { resize: plotsResize },
  };
}

beforeEach(() => {
  relayout.mockReset();
  plotsResize.mockReset();
  installPlotly();
});

afterEach(() => {
  delete (window as unknown as { Plotly?: PlotlyGlobal }).Plotly;
});

describe('resizePlotsInCell (editor:2379-2409)', () => {
  it('does nothing when there are no plotly plots', () => {
    const cell = fakeEl();
    resizePlotsInCell(cell as unknown as HTMLElement);
    expect(relayout).not.toHaveBeenCalled();
    expect(plotsResize).not.toHaveBeenCalled();
  });

  it('does nothing when Plotly is not loaded', () => {
    delete (window as unknown as { Plotly?: PlotlyGlobal }).Plotly;
    const cell = fakeEl();
    cell.querySelectorAll.mockReturnValue([fakeEl()]);
    expect(() => resizePlotsInCell(cell as unknown as HTMLElement)).not.toThrow();
    expect(relayout).not.toHaveBeenCalled();
  });

  it('resizes a plot inside .dt-chart: clears fixed height, relayouts with measured height', () => {
    const chartCt = fakeEl();
    chartCt.getBoundingClientRect.mockReturnValue({ height: 301 });
    const plot = fakeEl();
    plot.closest.mockImplementation((sel: string) => (sel === '.dt-chart' ? chartCt : null));
    const cell = fakeEl();
    cell.querySelectorAll.mockReturnValue([plot]);

    resizePlotsInCell(cell as unknown as HTMLElement);

    expect(chartCt.style.height).toBe('301px');
    expect(relayout).toHaveBeenCalledWith(plot, { height: 301 });
    expect(plotsResize).not.toHaveBeenCalled();
  });

  it('matches .di-chart as the chart container too', () => {
    const chartCt = fakeEl();
    chartCt.getBoundingClientRect.mockReturnValue({ height: 250 });
    const plot = fakeEl();
    plot.closest.mockImplementation((sel: string) => (sel === '.di-chart' ? chartCt : null));
    const cell = fakeEl();
    cell.querySelectorAll.mockReturnValue([plot]);

    resizePlotsInCell(cell as unknown as HTMLElement);
    expect(relayout).toHaveBeenCalledWith(plot, { height: 250 });
  });

  it('skips relayout when the measured chart height is ≤ 50', () => {
    const chartCt = fakeEl();
    chartCt.getBoundingClientRect.mockReturnValue({ height: 50 });
    const plot = fakeEl();
    plot.closest.mockReturnValue(chartCt);
    const cell = fakeEl();
    cell.querySelectorAll.mockReturnValue([plot]);

    resizePlotsInCell(cell as unknown as HTMLElement);
    expect(chartCt.style.height).toBe('');
    expect(relayout).not.toHaveBeenCalled();
  });

  it('falls back to Plotly.Plots.resize for plots without a chart container', () => {
    const plot = fakeEl();
    plot.closest.mockReturnValue(null);
    const cell = fakeEl();
    cell.querySelectorAll.mockReturnValue([plot]);

    resizePlotsInCell(cell as unknown as HTMLElement);
    expect(plotsResize).toHaveBeenCalledWith(plot);
    expect(relayout).not.toHaveBeenCalled();
  });

  it('clears inline height styles on table-mode .di-root wrappers (no plot inside)', () => {
    const wrap = fakeEl();
    const diRoot = fakeEl();
    diRoot.querySelector.mockImplementation((sel: string) =>
      sel === '.di-table-wrap' ? wrap : null
    );
    const cell = fakeEl();
    cell.querySelectorAll.mockImplementation((sel: string) =>
      sel === '.di-root' ? [diRoot] : []
    );

    resizePlotsInCell(cell as unknown as HTMLElement);

    expect(diRoot.style.height).toBe('');
    expect(diRoot.style.maxHeight).toBe('');
    expect(wrap.style.maxHeight).toBe('');
  });

  it('leaves chart-mode .di-root wrappers alone (plot present)', () => {
    const diRoot = fakeEl();
    diRoot.querySelector.mockReturnValue(fakeEl()); // has .js-plotly-plot
    const cell = fakeEl();
    cell.querySelectorAll.mockImplementation((sel: string) =>
      sel === '.di-root' ? [diRoot] : []
    );

    resizePlotsInCell(cell as unknown as HTMLElement);
    expect(diRoot.style.height).toBeUndefined();
    expect(diRoot.style.maxHeight).toBeUndefined();
  });
});
