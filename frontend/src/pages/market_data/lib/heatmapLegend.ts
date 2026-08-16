/*
 * M-data-6 — heatmap legend parser. The server composes legend_html from
 * _LEGEND_SPAN spans (api/heatmap.py:122-126, :458-463, :855-870) and the
 * legacy page injected it with innerHTML (:8664/:8667, :8616/:8621). The
 * Vue port never injects server HTML (no v-html): this parser accepts only
 * the exact span shape the server produces — a single style attribute whose
 * color declaration is a plain hex literal and a text-only label — and
 * returns structured items rendered with bound styles. Everything else
 * (nested markup, event handlers, url()/named colors) simply never parses,
 * so it can never reach the DOM.
 */

export interface HeatmapLegendItem {
  label: string;
  color: string;
}

/** Hex colors only — exactly what _LEGEND_SPAN emits. */
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** The server span: single- or double-quoted style, text-only label. */
const SPAN_RE = /<span\s+style=(['"])([^'"]*)\1>([^<]*)<\/span>/g;

/** Style payloads that could smuggle behavior — reject the whole item. */
const FORBIDDEN_STYLE = /url\s*\(|expression\s*\(|javascript\s*:/i;

function extractColor(style: string): string | null {
  for (const declaration of style.split(';')) {
    const pair = declaration.split(':');
    if (pair.length < 2) continue;
    const prop = (pair[0] ?? '').trim().toLowerCase();
    if (prop !== 'background' && prop !== 'background-color') continue;
    const value = pair.slice(1).join(':').trim();
    if (HEX_COLOR.test(value)) return value.toLowerCase();
  }
  return null;
}

/** Parse a server legend_html string into safe legend items. */
export function parseHeatmapLegend(html: unknown): HeatmapLegendItem[] {
  if (typeof html !== 'string' || !html) return [];
  const items: HeatmapLegendItem[] = [];
  for (const match of html.matchAll(SPAN_RE)) {
    const style = match[2] ?? '';
    const label = (match[3] ?? '').trim();
    if (!label) continue;
    if (FORBIDDEN_STYLE.test(style)) continue;
    const color = extractColor(style);
    if (!color) continue;
    items.push({ label, color });
  }
  return items;
}
