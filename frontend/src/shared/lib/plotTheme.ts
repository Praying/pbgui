import { PRECISION_PALETTE } from './precisionPalette';
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

/**
 * Dark chrome literals the builders emit; only these are rewritten.
 *
 * Derived from PRECISION_PALETTE rather than spelled out, because this set is
 * a second copy of the palette: when the palette was redesigned, a hand-written
 * list would silently stop matching and light-theme charts would keep dark
 * backgrounds with no error. The extra entries are the legacy Plotly literals
 * the Pareto layout still emits.
 */
const P = PRECISION_PALETTE;
const lower = (values: readonly string[]): Set<string> => new Set(values.map((v) => v.toLowerCase()));
const DARK_SURFACES = lower([
  P.surface.deep, P.surface.page, P.surface.input, P.surface.panel, P.surface.sidebar, P.surface.elevated,
  '#10141d', '#05080e', 'rgba(5, 8, 14,0)',
]);
const DARK_TEXTS = lower([P.text.primary, P.text.secondary, P.text.muted, '#e8ecf4']);
const DARK_GRIDS = lower([P.border.default, P.border.subtle, P.border.strong]);

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
