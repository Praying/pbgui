/**
 * resizePlotsInCell — port of the editor's Plotly resize loop
 * (dashboard_editor.html:2379-2409, exposed on the cell as `_resizePlots`).
 *
 * Legacy contract: during/after a resize drag, every `.js-plotly-plot` inside
 * a `.dt-chart`/`.di-chart` container gets its fixed inline height cleared so
 * CSS flex recomputes the available height, then Plotly.relayout is called
 * with the measured height (only when > 50px); plots elsewhere fall back to
 * Plotly.Plots.resize. Table-mode `.di-root` wrappers (no plot inside) get
 * their inline height/maxHeight constraints cleared so the flex chain clamps
 * them to the cell's explicit height.
 *
 * R2: Plotly stays a window global (loaded via the legacy `/app/plotly.min.js`
 * script tag) — no npm dependency.
 */

export interface PlotlyGlobal {
  relayout(element: unknown, layout: Record<string, unknown>): Promise<unknown>;
  Plots: { resize(element: unknown): void };
}

function plotly(): PlotlyGlobal | undefined {
  return (window as unknown as { Plotly?: PlotlyGlobal }).Plotly;
}

export function resizePlotsInCell(cellEl: HTMLElement): void {
  const plots = cellEl.querySelectorAll('.js-plotly-plot');
  if (plots.length > 0 && typeof plotly() !== 'undefined') {
    const Plotly = plotly()!;
    plots.forEach((p) => {
      const el = p as HTMLElement;
      const chartCt = el.closest('.dt-chart') || el.closest('.di-chart');
      if (chartCt) {
        /* Clear fixed inline height → CSS flex (with min-height:0) computes
           the correct available height (grow or shrink).
           getBoundingClientRect forces a sync layout recalc. */
        const ct = chartCt as HTMLElement;
        ct.style.height = '';
        const ctH = Math.round(ct.getBoundingClientRect().height);
        if (ctH > 50) {
          ct.style.height = ctH + 'px';
          void Plotly.relayout(p, { height: ctH });
        }
      } else {
        Plotly.Plots.resize(p);
      }
    });
  }
  /* Income table: clear inline styles — the cell has an explicit height from
     the drag, so the flex chain constrains automatically */
  cellEl.querySelectorAll('.di-root').forEach((dr) => {
    const el = dr as HTMLElement;
    if (!el.querySelector('.js-plotly-plot')) {
      el.style.height = '';
      el.style.maxHeight = '';
      const wrap = el.querySelector('.di-table-wrap') as HTMLElement | null;
      if (wrap) wrap.style.maxHeight = '';
    }
  });
}
