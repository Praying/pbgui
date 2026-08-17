import { describe, expect, it } from 'vitest';
import { darkPlotLayout, previewPlotLayout, projectionPlotLayout } from './plotLayout';

/*
 * Chart layout plumbing — ports of darkPlotLayout (:2580-2644), the preview
 * legend/margin/height overrides (:2914-2923, :2928-2937) and
 * projectionPlotLayout (:2646-2679; defined in legacy, never called there).
 */

describe('darkPlotLayout (:2580-2644)', () => {
  it('applies the dark theme defaults to an empty layout', () => {
    const layout = darkPlotLayout({});
    expect(layout.paper_bgcolor).toBe('#0e1117');
    expect(layout.plot_bgcolor).toBe('#0e1117');
    expect(layout.font).toEqual({ color: '#fafafa' });
    expect(layout.legend).toEqual({ font: { color: '#fafafa' } });
    expect(layout.margin).toEqual({ l: 80, r: 40, t: 60, b: 70 });
  });

  it('keeps caller-provided values that overlap the defaults', () => {
    const layout = darkPlotLayout({
      margin: { l: 30, r: 50, t: 60, b: 70, pad: 2 },
      font: { color: '#111111', size: 10 },
    });
    expect(layout.margin).toEqual({ l: 30, r: 50, t: 60, b: 70, pad: 2 });
    expect(layout.font).toEqual({ color: '#111111', size: 10 });
  });

  it('darkens xaxis/yaxis without dropping caller axes config', () => {
    const layout = darkPlotLayout({ xaxis: { title: { text: 'adg' }, range: [0, 1] }, yaxis: { type: 'log' } }) as Record<string, Record<string, unknown>>;
    expect(layout.xaxis).toEqual({ color: '#fafafa', gridcolor: 'rgba(255,255,255,0.12)', zerolinecolor: 'rgba(255,255,255,0.18)', title: { text: 'adg' }, range: [0, 1] });
    expect(layout.yaxis).toEqual({ color: '#fafafa', gridcolor: 'rgba(255,255,255,0.12)', zerolinecolor: 'rgba(255,255,255,0.18)', type: 'log' });
  });

  it('skips scene/polar/coloraxis sections that the caller does not supply', () => {
    const layout = darkPlotLayout({});
    expect(layout.scene).toBeUndefined();
    expect(layout.polar).toBeUndefined();
    expect(layout.coloraxis).toBeUndefined();
  });

  it('darkens scene axes and keeps their titles', () => {
    const layout = darkPlotLayout({
      scene: { xaxis: { title: 'x' }, camera: { eye: 1 } },
    }) as Record<string, Record<string, unknown>>;
    const scene = layout.scene as Record<string, unknown>;
    expect(scene.bgcolor).toBe('#0e1117');
    expect(scene.camera).toEqual({ eye: 1 });
    expect(scene.xaxis).toEqual({ backgroundcolor: '#0e1117', gridcolor: 'rgba(255,255,255,0.12)', color: '#fafafa', title: 'x' });
  });

  it('darkens polar axes and colorbar fonts', () => {
    const layout = darkPlotLayout({
      polar: { radialaxis: { range: [0, 1] } },
      coloraxis: { colorbar: { title: { text: 'adg' }, thickness: 20 } },
    }) as Record<string, Record<string, unknown>>;
    const polar = layout.polar as Record<string, Record<string, unknown>>;
    expect(polar.bgcolor).toBe('#0e1117');
    expect(polar.radialaxis).toEqual({ color: '#fafafa', gridcolor: 'rgba(255,255,255,0.16)', linecolor: 'rgba(255,255,255,0.22)', tickfont: { color: '#fafafa' }, range: [0, 1] });
    const coloraxis = layout.coloraxis as Record<string, Record<string, unknown>>;
    expect(coloraxis.colorbar!.thickness).toBe(20);
    expect(coloraxis.colorbar!.title).toEqual({ text: 'adg', font: { color: '#fafafa' } });
    expect(coloraxis.colorbar!.tickfont).toEqual({ color: '#fafafa' });
  });

  it('darkens annotation fonts without mutating the input annotation', () => {
    const annotation = { text: 'note', font: { size: 12 } };
    const layout = darkPlotLayout({ annotations: [annotation] }) as Record<string, unknown[]>;
    const out = layout.annotations as { font: Record<string, unknown> }[];
    expect(out[0]!.font).toEqual({ color: '#fafafa', size: 12 });
    expect(annotation.font).toEqual({ size: 12 });
  });
});

describe('previewPlotLayout (:2914-2923, :2928-2937)', () => {
  it('lifts the legend above the plot and enforces a 750px minimum height', () => {
    const layout = previewPlotLayout({ height: 300 }) as Record<string, unknown>;
    expect(layout.legend).toEqual({ font: { color: '#fafafa' }, orientation: 'h', x: 0, xanchor: 'left', y: 1.14, yanchor: 'bottom' });
    expect(layout.margin).toEqual({ l: 80, r: 40, t: 110, b: 70 });
    expect(layout.height).toBe(750);
  });

  it('keeps a taller caller height', () => {
    const layout = previewPlotLayout({ height: 900 }) as Record<string, unknown>;
    expect(layout.height).toBe(900);
  });
});

describe('projectionPlotLayout (:2646-2679)', () => {
  it('centres the projection title and trims the colorbar — legacy kept this unused', () => {
    const layout = projectionPlotLayout(
      {
        annotations: [{ name: 'projection-colorbar-title' }, { text: 'keep' }],
        coloraxis: { colorbar: { title: { text: 'x' } } },
        xaxis: { title: { text: 'x' } },
      },
      'XY projection'
    ) as Record<string, unknown>;
    expect(layout.title).toEqual({ text: 'XY projection', x: 0.5, xanchor: 'center', y: 0.98, yanchor: 'top', font: { color: '#9fb3c8', size: 13 } });
    expect(layout.annotations).toEqual([{ text: 'keep', font: { color: '#fafafa' } }]);
    expect(layout.margin).toEqual({ l: 70, r: 95, t: 56, b: 64 });
    const colorbar = (layout.coloraxis as Record<string, Record<string, unknown>>).colorbar;
    expect(colorbar).toEqual({ title: { text: 'x', font: { color: '#fafafa' } }, x: 1.01, thickness: 14, len: 0.78, tickfont: { size: 10, color: '#fafafa' } });
    const xaxis = layout.xaxis as Record<string, Record<string, unknown>>;
    expect(xaxis.title).toEqual({ text: 'x', standoff: 10 });
  });
});
