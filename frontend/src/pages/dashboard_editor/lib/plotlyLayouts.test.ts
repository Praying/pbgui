import { describe, expect, it, vi } from 'vitest';
import {
  adgTraces,
  applyPplZoom,
  applyRangeZoom,
  captureFracZoom,
  captureZoom,
  incomeLayout,
  incomeTraces,
  plotlyConfig,
  pnlLayout,
  pnlTraces,
  pplLayout,
  pplTraces,
  topLayout,
  topTraces,
  type GdLike,
  type PlotlyLayout,
} from './plotlyLayouts';

/*
 * Trace/layout factory parity tests — the legacy renderers these port:
 *   renderTop  dashboard_render.js:600-659
 *   renderPnl  dashboard_render.js:1593-1668
 *   renderAdg  dashboard_render.js:3866-3933
 *   renderPpl  dashboard_render.js:1873-1951
 *   fast-path zoom capture  render.js:1696-1709 / 1980-1993 / 3974-3987
 *   _getFracZoom  dashboard_ppl.html:105-117
 * dashT has no translator in unit tests → English fallback literals, exactly
 * the legacy fallback path.
 */

const income = (v: number) => v.toFixed(2);

describe('topTraces (render.js:600-605)', () => {
  it('maps rows to symbol/income bars with sign colors and the legacy hovertemplate', () => {
    const rows = [
      ['1', 'BTC', '1.5'],
      ['2', 'ETH', -2],
      ['3', 'SOL', 0],
    ];
    expect(topTraces(rows)).toEqual([
      {
        x: ['BTC', 'ETH', 'SOL'],
        y: [1.5, -2, 0],
        type: 'bar',
        marker: { color: ['#8fb593', '#c58e8a', '#8fb593'] },
        hovertemplate: '<b>%{x}</b><br>Income: %{y:.4f}<extra></extra>',
      },
    ]);
  });

  it('parses string incomes like legacy parseFloat (r[2] raw)', () => {
    const rows = [['1', 'BTC', '12.345']];
    expect((topTraces(rows)[0]!.y as number[])[0]).toBe(12.345);
  });
});

describe('topLayout (render.js:606-618, 659)', () => {
  it('matches the legacy layout skeleton', () => {
    expect(topLayout(300)).toEqual({
      paper_bgcolor: '#16141a',
      plot_bgcolor: '#16141a',
      font: { color: '#e9e5ee', size: 11 },
      margin: { l: 50, r: 20, t: 40, b: 60 },
      xaxis: { tickangle: -45, gridcolor: '#3a3545', color: '#e9e5ee' },
      yaxis: {
        gridcolor: '#3a3545', color: '#e9e5ee',
        zeroline: true, zerolinecolor: '#524b60',
      },
      bargap: 0.3,
      autosize: true,
      height: 300,
      transition: { duration: 0, easing: 'linear' },
    });
  });

  it('omits height when falsy (legacy `if (origHeight)`)', () => {
    expect(topLayout(0)).not.toHaveProperty('height');
    expect(topLayout(null)).not.toHaveProperty('height');
  });
});

describe('pnlTraces (render.js:1595-1642)', () => {
  const bars = [
    { date: '2025-01-01', income: 1.5 },
    { date: '2025-01-02', income: -2 },
  ];

  it('bar mode: values with toFixed(2) text, textposition auto', () => {
    expect(pnlTraces(bars, 'bar')).toEqual([
      {
        x: ['2025-01-01', '2025-01-02'],
        y: [1.5, -2],
        type: 'bar',
        marker: { color: ['#8fb593', '#c58e8a'] },
        text: ['1.50', '-2.00'],
        textposition: 'auto',
        hovertemplate: '<b>%{x}</b><br>Income: %{y:.2f}<extra></extra>',
      },
    ]);
  });

  it('line mode: scatter lines+markers with the legacy line color/width', () => {
    expect(pnlTraces(bars, 'line')).toEqual([
      {
        x: ['2025-01-01', '2025-01-02'],
        y: [1.5, -2],
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#8ba7c2', width: 1 },
        marker: { color: ['#8fb593', '#c58e8a'], size: 6 },
        hovertemplate: '<b>%{x}</b><br>Income: %{y:.2f}<extra></extra>',
      },
    ]);
  });

  it('falls back to bar mode for unknown modes (legacy else branch)', () => {
    expect(pnlTraces(bars, 'bogus')[0]!.type).toBe('bar');
  });
});

describe('pnlLayout (render.js:1644-1656)', () => {
  it('matches the legacy PNL/ADG layout skeleton', () => {
    const layout = pnlLayout(280);
    expect(layout.margin).toEqual({ l: 50, r: 20, t: 40, b: 50 });
    expect(layout.xaxis).toEqual({
      tickangle: -45, gridcolor: '#3a3545', color: '#e9e5ee', type: 'date',
    });
    expect(layout.height).toBe(280);
    expect(layout.transition).toEqual({ duration: 0, easing: 'linear' });
  });
});

describe('adgTraces (render.js:3871-3889)', () => {
  it('reads b.adg and uses the untranslated ADG hovertemplate with % suffix', () => {
    const bars = [{ date: '2025-01-01', adg: 1.5 }, { date: '2025-01-02', adg: -2 }];
    const trace = adgTraces(bars, 'bar')[0]!;
    expect(trace.y).toEqual([1.5, -2]);
    expect(trace.text).toEqual([income(1.5), income(-2)]);
    expect(trace.hovertemplate).toBe('<b>%{x}</b><br>ADG: %{y:.2f}%<extra></extra>');
  });

  it('line mode matches PNL line styling', () => {
    const bars = [{ date: '2025-01-01', adg: 1.5 }];
    expect(adgTraces(bars, 'line')[0]!.type).toBe('scatter');
    expect(adgTraces(bars, 'line')[0]!.line).toEqual({ color: '#8ba7c2', width: 1 });
  });
});

describe('pplTraces (render.js:1878-1900)', () => {
  const bars = [
    { period: '2025-W01', profits: 10.5, losses: 0 },
    { period: '2025-W02', profits: 0, losses: 3.25 },
  ];

  it('builds the profit + loss traces with the legacy 0→"" text quirk', () => {
    expect(pplTraces(bars)).toEqual([
      {
        x: ['2025-W01', '2025-W02'],
        y: [10.5, 0],
        type: 'bar',
        name: 'Profits',
        marker: { color: '#8fb593' },
        text: ['10.50', ''],
        textposition: 'outside',
        hovertemplate: '<b>%{x}</b><br>Profits: %{y:.2f}<extra></extra>',
      },
      {
        x: ['2025-W01', '2025-W02'],
        y: [0, 3.25],
        type: 'bar',
        name: 'Losses',
        marker: { color: '#c58e8a' },
        text: ['', '3.25'],
        textposition: 'outside',
        hovertemplate: '<b>%{x}</b><br>Losses: %{y:.2f}<extra></extra>',
      },
    ]);
  });
});

describe('pplLayout y-range padding (render.js:1903-1911)', () => {
  it('pads the data range by 10%', () => {
    const bars = [{ period: 'a', profits: 20, losses: 10 }];
    const layout = pplLayout(null, bars);
    expect((layout.yaxis as PlotlyLayout).range).toEqual([9, 21]);
    expect(layout.barmode).toBe('relative');
    expect((layout.xaxis as PlotlyLayout).type).toBe('category');
    expect((layout.xaxis as PlotlyLayout).nticks).toBe(20);
    expect(layout.legend).toEqual({ font: { color: '#e9e5ee' } });
  });

  it('guards a zero data range with the 20%-or-1 fallback (yRange=0)', () => {
    const bars = [{ period: 'a', profits: 0, losses: 0 }];
    const layout = pplLayout(null, bars);
    expect((layout.yaxis as PlotlyLayout).range).toEqual([-1, 1]);
  });

  it('guards a zero range on a non-zero flat value (|v|*0.2)', () => {
    const bars = [{ period: 'a', profits: 50, losses: 50 }];
    const layout = pplLayout(null, bars);
    expect((layout.yaxis as PlotlyLayout).range).toEqual([40, 60]);
  });
});

describe('applyRangeZoom (render.js:1630-1637, 3907-3913)', () => {
  it('sets range + autorange false only for non-null ranges', () => {
    const layout = pnlLayout(280);
    const out = applyRangeZoom(layout, { xrange: [1, 2], yrange: null });
    expect((out.xaxis as PlotlyLayout).range).toEqual([1, 2]);
    expect((out.xaxis as PlotlyLayout).autorange).toBe(false);
    expect((out.yaxis as PlotlyLayout).range).toBeUndefined();
  });

  it('does not mutate the input layout (immutability)', () => {
    const layout = pnlLayout(280);
    applyRangeZoom(layout, { xrange: [1, 2], yrange: [3, 4] });
    expect((layout.xaxis as PlotlyLayout).range).toBeUndefined();
    expect((layout.xaxis as PlotlyLayout).autorange).toBeUndefined();
  });

  it('returns the layout unchanged when there is no zoom', () => {
    const layout = pnlLayout(280);
    expect(applyRangeZoom(layout, null)).toBe(layout);
  });
});

describe('applyPplZoom frac remap (render.js:1901-1913)', () => {
  it('remaps the fractional range onto the new bar count', () => {
    const layout = pplLayout(null, [{ period: 'a', profits: 1, losses: 0 }]);
    const out = applyPplZoom(layout, {
      xrange: null, yrange: null, fracRange: [0.25, 0.75],
    }, 8);
    expect((out.xaxis as PlotlyLayout).range).toEqual([2, 6]);
    expect((out.xaxis as PlotlyLayout).autorange).toBe(false);
  });

  it('clamps the remap into [-0.5, m-0.5]', () => {
    const layout = pplLayout(null, [{ period: 'a', profits: 1, losses: 0 }]);
    const out = applyPplZoom(layout, {
      xrange: null, yrange: null, fracRange: [-0.5, 1.5],
    }, 8);
    expect((out.xaxis as PlotlyLayout).range).toEqual([-0.5, 7.5]);
  });

  it('skips the remap when the fraction is degenerate (legacy validity check)', () => {
    const layout = pplLayout(null, [{ period: 'a', profits: 1, losses: 0 }]);
    const out = applyPplZoom(layout, {
      xrange: null, yrange: null, fracRange: [0.9, 0.1],
    }, 8);
    expect((out.xaxis as PlotlyLayout).range).toBeUndefined();
  });

  it('does not restore the y-range in the frac branch (aggregation scale changes)', () => {
    const layout = pplLayout(null, [{ period: 'a', profits: 1, losses: 0 }]);
    const out = applyPplZoom(layout, {
      xrange: null, yrange: [10, 20], fracRange: [0.25, 0.75],
    }, 8);
    expect((out.yaxis as PlotlyLayout).range).toEqual([-0.1, 1.1]); // base padding kept
  });

  it('falls back to the plain range branch without a fracRange', () => {
    const layout = pplLayout(null, [{ period: 'a', profits: 1, losses: 0 }]);
    const out = applyPplZoom(layout, { xrange: [1, 2], yrange: [3, 4] }, 8);
    expect((out.xaxis as PlotlyLayout).range).toEqual([1, 2]);
    expect((out.yaxis as PlotlyLayout).range).toEqual([3, 4]);
  });
});

describe('captureZoom (render.js:1698-1705 fast-path)', () => {
  it('captures sliced ranges when autorange is false', () => {
    const range = [1, 2];
    const gd: GdLike = {
      layout: {
        xaxis: { autorange: false, range },
        yaxis: { autorange: false, range: [3, 4] },
      },
    };
    const zoom = captureZoom(gd);
    expect(zoom.xrange).toEqual([1, 2]);
    expect(zoom.yrange).toEqual([3, 4]);
    expect(zoom.xrange).not.toBe(range); // legacy .slice() copy
  });

  it('returns nulls when autorange is on or ranges are missing', () => {
    expect(captureZoom({ layout: { xaxis: { autorange: true, range: [1, 2] } } }))
      .toEqual({ xrange: null, yrange: null });
    expect(captureZoom({ layout: {} })).toEqual({ xrange: null, yrange: null });
    expect(captureZoom({})).toEqual({ xrange: null, yrange: null });
  });
});

describe('captureFracZoom (dashboard_ppl.html:105-117)', () => {
  it('normalizes the x-range by the current bar count', () => {
    const gd: GdLike = {
      layout: { xaxis: { autorange: false, range: [1, 3] }, yaxis: { autorange: false, range: [5, 6] } },
      data: [{ x: [0, 1, 2, 3] }],
    };
    expect(captureFracZoom(gd)).toEqual({ fracRange: [0.25, 0.75], yrange: [5, 6] });
  });

  it('returns null without an x zoom or with too few bars', () => {
    expect(captureFracZoom({
      layout: { xaxis: { autorange: true } }, data: [{ x: [0, 1, 2] }],
    })).toBeNull();
    expect(captureFracZoom({
      layout: { xaxis: { autorange: false, range: [0, 1] } }, data: [{ x: [0] }],
    })).toBeNull();
  });
});

describe('plotlyConfig (render.js:653-684)', () => {
  it('passes the display/responsive flags and the shared fullscreen modebar button', () => {
    const onToggle = vi.fn();
    const cfg = plotlyConfig({ displayModeBar: true, responsive: true, onToggleFullscreen: onToggle });
    expect(cfg.displayModeBar).toBe(true);
    expect(cfg.responsive).toBe(true);
    const btn = (cfg.modeBarButtonsToAdd as Record<string, unknown>[])[0]!;
    expect(btn.name).toBe('fullscreen');
    expect(btn.title).toBe('Fullscreen'); // dash.fullscreen fallback
    expect((btn.icon as Record<string, unknown>).path).toBe(
      'M0 0v285.7h142.9V142.9H285.7V0H0zm571.4 0v142.9h142.9v142.9H857.1V0H571.4zM0 571.4v285.7h285.7V714.3H142.9V571.4H0zm714.3 142.9v142.9H571.4v142.9H857.1V571.4H714.3z'
    );
    (btn.click as (gd: unknown) => void)('gd');
    expect(onToggle).toHaveBeenCalledWith('gd');
  });
});

/* ── INCOME (dashboard_render.js:866-893 fast path + 1500-1524 _buildIncomeChart) ── */

describe('incomeTraces (render.js:866-868 / 1501-1510)', () => {
  it('maps server traces to scatter/lines with legend', () => {
    const traces = incomeTraces([
      { name: 'Total Income', x: ['2024-01-01 00:00:00', '2024-01-02 00:00:00'], y: [10, 25] },
      { name: 'BTC', x: ['2024-01-01 00:00:00'], y: [10] },
    ]);
    expect(traces).toEqual([
      {
        x: ['2024-01-01 00:00:00', '2024-01-02 00:00:00'],
        y: [10, 25],
        name: 'Total Income',
        type: 'scatter',
        mode: 'lines',
        showlegend: true,
      },
      { x: ['2024-01-01 00:00:00'], y: [10], name: 'BTC', type: 'scatter', mode: 'lines', showlegend: true },
    ]);
  });

  it('returns new trace objects per call (traces are never mutated in place)', () => {
    const input = [{ name: 'a', x: ['2024-01-01 00:00:00'], y: [2] }];
    const a = incomeTraces(input);
    const b = incomeTraces(input);
    expect(a[0]).not.toBe(b[0]);
  });
});

describe('incomeLayout (render.js:869-877 / 1513-1524)', () => {
  it('matches the legacy income layout skeleton (margins l55 r15 t40 b40, transparent legend)', () => {
    expect(incomeLayout(null)).toEqual({
      paper_bgcolor: '#16141a',
      plot_bgcolor: '#16141a',
      font: { color: '#e9e5ee', size: 11 },
      margin: { l: 55, r: 15, t: 40, b: 40 },
      autosize: true,
      xaxis: { gridcolor: '#3a3545', color: '#e9e5ee' },
      yaxis: { gridcolor: '#3a3545', color: '#e9e5ee', zeroline: true, zerolinecolor: '#524b60' },
      legend: { bgcolor: 'rgba(0,0,0,0)', font: { size: 10, color: '#e9e5ee' } },
      transition: { duration: 0, easing: 'linear' },
    });
  });

  it('adds the explicit height only when provided (legacy origHeight branch, render.js:1524)', () => {
    expect(incomeLayout(320)).toEqual({ ...incomeLayout(null), height: 320 });
  });
});
