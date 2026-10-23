import { currentTheme, themeColors } from './themeColors';

/**
 * Light-theme rewrite for Plotly layouts.
 *
 * Every Plotly figure in the app is built against the dark palette: deep
 * navy paper/plot backgrounds, near-white text, grey grid. On a white page
 * that is a black rectangle with pale text. Rather than thread a theme
 * through ~60 builder call sites, figures are passed through this one
 * function on their way to Plotly.
 *
 * It rewrites only *chrome* — paper/plot background, font and tick colours,
 * grid and zero lines, legend text, colourbar ticks and annotation text.
 * Series colours are left as the builders chose them; the semantic
 * green/red/amber/blue ramp reads on both backgrounds.
 *
 * In the dark theme the layout is returned untouched (same object), so the
 * dark rendering and every existing layout assertion are unchanged.
 */
type Layout = Record<string, unknown>;

const isObject = (v: unknown): v is Layout => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Dark literals the builders emit as chrome; only these are rewritten. */
const DARK_SURFACES = new Set(['#091117', '#0d171e', '#12222c', '#10141d', '#05080e', 'rgba(5, 8, 14,0)']);
const DARK_TEXTS = new Set(['#edf7fa', '#b7cbd2', '#89a3ad', '#e8ecf4']);
const DARK_GRIDS = new Set(['#385261', '#263d49', '#587080']);

function isWhiteInk(v: unknown): boolean {
  return typeof v === 'string' && /^rgba?\(\s*255\s*,\s*255\s*,\s*255/.test(v.replace(/\s+/g, ' '));
}

function remap(key: string, value: unknown, c: ReturnType<typeof themeColors>): unknown {
  if (typeof value !== 'string') return value;
  const v = value.trim().toLowerCase();
  if (/(^|_)(paper_bgcolor|plot_bgcolor|bgcolor|backgroundcolor)$/i.test(key) || key === 'bgcolor') {
    if (v === 'rgba(5, 8, 14,0)' || v.startsWith('rgba(0') || v === 'transparent') return value;
    return DARK_SURFACES.has(v) ? c.surface : value;
  }
  if (key === 'color' || key === 'tickcolor' || key === 'linecolor') {
    if (DARK_TEXTS.has(v)) return c.text;
    if (DARK_GRIDS.has(v) || isWhiteInk(value)) return c.zeroline;
    return value;
  }
  if (key === 'gridcolor') return DARK_GRIDS.has(v) || isWhiteInk(value) ? c.grid : value;
  if (key === 'zerolinecolor') return DARK_GRIDS.has(v) || isWhiteInk(value) ? c.zeroline : value;
  return value;
}

function walk(node: unknown, c: ReturnType<typeof themeColors>, depth = 0): unknown {
  if (depth > 8) return node;
  if (Array.isArray(node)) return node.map((item) => walk(item, c, depth + 1));
  if (!isObject(node)) return node;
  const out: Layout = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = isObject(value) || Array.isArray(value) ? walk(value, c, depth + 1) : remap(key, value, c);
  }
  return out;
}

export function themedPlotLayout<T extends Layout | null | undefined>(layout: T): T {
  if (!layout || currentTheme() !== 'light') return layout;
  // Chrome only: never descend into `data`/traces — this takes a layout.
  return walk(layout, themeColors()) as T;
}
