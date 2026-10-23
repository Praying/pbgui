import { afterEach, describe, expect, it, vi } from 'vitest';
import { themedPlotLayout } from './plotTheme';
import { withTheme } from './themedPlotly';

const DARK_LAYOUT = {
  paper_bgcolor: '#091117',
  plot_bgcolor: '#091117',
  font: { color: '#edf7fa' },
  legend: { bgcolor: 'rgba(5, 8, 14,0)', font: { color: '#edf7fa' } },
  xaxis: { gridcolor: '#385261', zerolinecolor: '#587080', color: '#edf7fa' },
  yaxis: { gridcolor: 'rgba(255,255,255,0.12)', zerolinecolor: 'rgba(255,255,255,0.18)' },
  scene: { bgcolor: '#10141d', xaxis: { backgroundcolor: '#10141d', gridcolor: 'rgba(255,255,255,0.12)', color: '#e8ecf4' } },
  margin: { l: 80 },
};

function setLight() {
  document.documentElement.dataset.theme = 'light';
  document.documentElement.style.setProperty('--color-page', '#f4f7f9');
  document.documentElement.style.setProperty('--color-primary', '#0f1f27');
  document.documentElement.style.setProperty('--overlay-rgb', '15 31 39');
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute('style');
});

describe('themedPlotLayout', () => {
  it('returns the very same object in the dark theme', () => {
    expect(themedPlotLayout(DARK_LAYOUT)).toBe(DARK_LAYOUT);
  });

  it('passes null / undefined through', () => {
    expect(themedPlotLayout(null)).toBeNull();
    expect(themedPlotLayout(undefined)).toBeUndefined();
  });

  it('rewrites dark backgrounds, text and grid ink for the light theme', () => {
    setLight();
    const out = themedPlotLayout(DARK_LAYOUT) as typeof DARK_LAYOUT;
    expect(out.paper_bgcolor).toBe('#f4f7f9');
    expect(out.plot_bgcolor).toBe('#f4f7f9');
    expect(out.font.color).toBe('#0f1f27');
    expect(out.legend.font.color).toBe('#0f1f27');
    expect(out.xaxis.color).toBe('#0f1f27');
    expect(out.scene.bgcolor).toBe('#f4f7f9');
    expect(out.scene.xaxis.backgroundcolor).toBe('#f4f7f9');
    expect(out.scene.xaxis.color).toBe('#0f1f27');
  });

  it('turns white-on-dark grid lines into ink-on-light, so they do not vanish', () => {
    setLight();
    const out = themedPlotLayout(DARK_LAYOUT) as typeof DARK_LAYOUT;
    expect(out.yaxis.gridcolor).toBe('rgba(15,31,39,0.12)');
    expect(out.yaxis.zerolinecolor).toBe('rgba(15,31,39,0.18)');
    expect(out.xaxis.gridcolor).toBe('rgba(15,31,39,0.12)');
  });

  it('leaves transparent legends, geometry and unknown colours alone', () => {
    setLight();
    const out = themedPlotLayout({ ...DARK_LAYOUT, font: { color: '#ff00aa' } }) as typeof DARK_LAYOUT;
    expect(out.legend.bgcolor).toBe('rgba(5, 8, 14,0)');
    expect(out.margin).toEqual({ l: 80 });
    expect(out.font.color).toBe('#ff00aa');
  });

  it('does not mutate its input', () => {
    setLight();
    const snapshot = JSON.stringify(DARK_LAYOUT);
    themedPlotLayout(DARK_LAYOUT);
    expect(JSON.stringify(DARK_LAYOUT)).toBe(snapshot);
  });
});

describe('withTheme (Plotly facade)', () => {
  function fakePlotly() {
    return {
      newPlot: vi.fn(async (..._args: unknown[]) => undefined),
      react: vi.fn(async (..._args: unknown[]) => undefined),
      relayout: vi.fn(async (..._args: unknown[]) => undefined),
      purge: vi.fn((..._args: unknown[]) => undefined),
      Plots: { resize: vi.fn((..._args: unknown[]) => undefined) },
    };
  }

  it('returns undefined when Plotly is not loaded', () => {
    expect(withTheme(undefined)).toBeUndefined();
  });

  it('themes the layout handed to newPlot and react in the light theme', () => {
    setLight();
    const plotly = fakePlotly();
    const wrapped = withTheme(plotly)!;
    void wrapped.newPlot('a', [], DARK_LAYOUT, {});
    void wrapped.react('a', [], DARK_LAYOUT, {});
    expect((plotly.newPlot.mock.calls[0] as unknown[])[2]).toMatchObject({ paper_bgcolor: '#f4f7f9' });
    expect((plotly.react.mock.calls[0] as unknown[])[2]).toMatchObject({ paper_bgcolor: '#f4f7f9' });
  });

  it('hands the original layout through untouched in the dark theme', () => {
    const plotly = fakePlotly();
    void withTheme(plotly)!.newPlot('a', [], DARK_LAYOUT, {});
    expect((plotly.newPlot.mock.calls[0] as unknown[])[2]).toBe(DARK_LAYOUT);
  });

  it('passes relayout, purge and nested members straight through', () => {
    const plotly = fakePlotly();
    const wrapped = withTheme(plotly)!;
    void wrapped.relayout('a', { height: 5 });
    wrapped.purge('a');
    wrapped.Plots.resize(document.body);
    expect(plotly.relayout).toHaveBeenCalledWith('a', { height: 5 });
    expect(plotly.purge).toHaveBeenCalledWith('a');
    expect(plotly.Plots.resize).toHaveBeenCalled();
  });
});
