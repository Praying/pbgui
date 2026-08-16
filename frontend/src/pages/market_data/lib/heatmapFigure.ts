/*
 * M-data-6 — the Plotly figure bridge (legacy applyPlotlyFigure :8487-8498
 * and clearInventoryPlot :8474-8485, market_data_main.html).
 *
 * Plotly stays a vendor global loaded by index.html (:3661 → the Vue
 * index.html mirror) — never bundled (recon R6, dashboard R2 decision).
 * Figures are server-computed JSON; this bridge only feeds them to
 * window.Plotly against a host element the owning component registers.
 *
 * Hardened deviation (documented): legacy wiped innerHTML and re-plotted,
 * leaking the previous Plotly state; the bridge now purges a plotted
 * target BEFORE newPlot — the purge contract clearInventoryPlot already
 * used (:8477-8483).
 */

/** The two window.Plotly entry points this page calls (:8479, :8492). */
export interface PlotlyLike {
  newPlot(
    graphDiv: HTMLElement,
    data: unknown[],
    layout: unknown,
    config: unknown
  ): Promise<unknown>;
  purge(graphDiv: HTMLElement): void;
}

/** Legacy newPlot config, verbatim (:8493-8496). */
export const PLOTLY_CONFIG = {
  displayModeBar: 'hover',
  responsive: true,
  scrollZoom: false,
  displaylogo: false,
} as const;

interface PlottedElement extends HTMLElement {
  data?: unknown[];
}

function isPlotted(el: HTMLElement): boolean {
  return Array.isArray((el as PlottedElement).data);
}

/** Legacy applyPlotlyFigure (:8487-8498) — purge-before-replace hardened. */
export async function applyPlotlyFigure(
  el: HTMLElement,
  plotly: PlotlyLike | undefined,
  figureJson: unknown
): Promise<void> {
  if (!plotly) return; // :8489
  const figure =
    typeof figureJson === 'string' ? (JSON.parse(figureJson) as { data?: unknown; layout?: unknown }) : figureJson; // :8490
  if (isPlotted(el)) {
    try {
      plotly.purge(el); // hardened :8479 — before replacing a plotted target
    } catch {
      /* :8480-8482 */
    }
  }
  el.innerHTML = ''; // :8491
  const payload = (figure ?? {}) as { data?: unknown; layout?: unknown };
  const data = Array.isArray(payload.data) ? payload.data : []; // figure.data || []
  await plotly.newPlot(el, data, payload.layout ?? {}, PLOTLY_CONFIG); // :8492-8497
}

/** Legacy clearInventoryPlot (:8474-8485). */
export function clearPlotlyTarget(
  el: HTMLElement,
  plotly: PlotlyLike | undefined,
  message: string
): void {
  if (plotly && isPlotted(el)) {
    try {
      plotly.purge(el); // :8479
    } catch {
      /* :8480-8482 */
    }
  }
  const text = message; // caller pre-translates; empty falls to noChart
  el.innerHTML = `<div class="inventory-empty"></div>`;
  const box = el.querySelector('.inventory-empty');
  if (box) box.textContent = text || 'market.noChart'; // :8484 (t applied by caller)
}
