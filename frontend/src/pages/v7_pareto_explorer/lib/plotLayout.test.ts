import { describe, expect, it } from 'vitest';
import { darkPlotLayout, previewPlotLayout } from './plotLayout';

/*
 * Chart layout plumbing — ports of darkPlotLayout (:2580-2644) and the
 * preview legend/margin/height overrides (:2914-2923, :2928-2937). The
 * legacy projectionPlotLayout (:2646-2679) was never called there either
 * and was not ported.
 */

describe('darkPlotLayout (:2580-2644)', () => {
  it('applies the dark theme defaults to an empty layout', () => {
    const layout = darkPlotLayout({});
    expect(layout.paper_bgcolor).toBe('#10141d');
    expect(layout.plot_bgcolor).toBe('#10141d');
    expect(layout.font).toEqual({ color: '#e8ecf4' });
    expect(layout.legend).toEqual({ font: { color: '#e8ecf4' } });
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
    expect(layout.xaxis).toEqual({ color: '#e8ecf4', gridcolor: 'rgba(255,255,255,0.12)', zerolinecolor: 'rgba(255,255,255,0.18)', title: { text: 'adg' }, range: [0, 1] });
    expect(layout.yaxis).toEqual({ color: '#e8ecf4', gridcolor: 'rgba(255,255,255,0.12)', zerolinecolor: 'rgba(255,255,255,0.18)', type: 'log' });
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
    expect(scene.bgcolor).toBe('#10141d');
    expect(scene.camera).toEqual({ eye: 1 });
    expect(scene.xaxis).toEqual({ backgroundcolor: '#10141d', gridcolor: 'rgba(255,255,255,0.12)', color: '#e8ecf4', title: 'x' });
  });

  it('darkens polar axes and colorbar fonts', () => {
    const layout = darkPlotLayout({
      polar: { radialaxis: { range: [0, 1] } },
      coloraxis: { colorbar: { title: { text: 'adg' }, thickness: 20 } },
    }) as Record<string, Record<string, unknown>>;
    const polar = layout.polar as Record<string, Record<string, unknown>>;
    expect(polar.bgcolor).toBe('#10141d');
    expect(polar.radialaxis).toEqual({ color: '#e8ecf4', gridcolor: 'rgba(255,255,255,0.16)', linecolor: 'rgba(255,255,255,0.22)', tickfont: { color: '#e8ecf4' }, range: [0, 1] });
    const coloraxis = layout.coloraxis as Record<string, Record<string, unknown>>;
    expect(coloraxis.colorbar!.thickness).toBe(20);
    expect(coloraxis.colorbar!.title).toEqual({ text: 'adg', font: { color: '#e8ecf4' } });
    expect(coloraxis.colorbar!.tickfont).toEqual({ color: '#e8ecf4' });
  });

  it('darkens annotation fonts without mutating the input annotation', () => {
    const annotation = { text: 'note', font: { size: 12 } };
    const layout = darkPlotLayout({ annotations: [annotation] }) as Record<string, unknown[]>;
    const out = layout.annotations as { font: Record<string, unknown> }[];
    expect(out[0]!.font).toEqual({ color: '#e8ecf4', size: 12 });
    expect(annotation.font).toEqual({ size: 12 });
  });
});

describe('previewPlotLayout (:2914-2923, :2928-2937)', () => {
  it('lifts the legend above the plot and enforces a 750px minimum height', () => {
    const layout = previewPlotLayout({ height: 300 }) as Record<string, unknown>;
    expect(layout.legend).toEqual({ font: { color: '#e8ecf4' }, orientation: 'h', x: 0, xanchor: 'left', y: 1.14, yanchor: 'bottom' });
    expect(layout.margin).toEqual({ l: 80, r: 40, t: 110, b: 70 });
    expect(layout.height).toBe(750);
  });

  it('keeps a taller caller height', () => {
    const layout = previewPlotLayout({ height: 900 }) as Record<string, unknown>;
    expect(layout.height).toBe(900);
  });
});
