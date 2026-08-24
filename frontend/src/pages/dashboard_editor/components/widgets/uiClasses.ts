/**
 * Shared Tailwind class sets for the widget chrome — the former
 * .dt-root, .di-root, .dt-meta and .dt-ctrl rules of styles/widgets.css
 * (deleted at the Tailwind migration). Centralized here because the
 * same header control row is rendered by six widget components.
 *
 * The legacy class names (dt-root, dt-ctrl-sel, …) ride along as inert
 * anchors — the tests select them, and lib/plotlyResize.ts queries the
 * chart roots by class.
 *
 * Colour sets are COMPLETE per string: no element ever combines two of
 * these constants that claim the same property, and the dynamic tone
 * variants (timeframe buttons, income rows) each carry their own full
 * set — Tailwind emits same-property utilities in its own fixed order.
 */

/** The former `.dt-root, .di-root` base rule. */
export const dtRootClass =
  'dt-root relative overflow-hidden rounded-md bg-page font-sans text-[0.875rem] text-primary';

/** `.di-root` adds the column flex chain (it hosts the scrollable table). */
export const diRootClass =
  'di-root relative flex w-full flex-col overflow-hidden rounded-md bg-page font-sans text-[0.875rem] text-primary';

/** `.dt-header` (the cell drag source — the grab cursor lives in
 *  GridCell's engine CSS). */
export const dtHeaderClass =
  'dt-header flex flex-nowrap items-center justify-start gap-[0.4rem] border-b border-b-border-default bg-card px-[0.75rem] py-[0.45rem]';

/** `.dt-title` */
export const dtTitleClass =
  'dt-title shrink-0 whitespace-nowrap text-[0.88rem] font-semibold text-accent-soft';

/** `.dt-icon` */
export const dtIconClass = 'dt-icon shrink-0 text-[0.85rem] leading-none';

/** `.dt-trash` (the legacy --db-text-dim colour resolved to text-muted). */
export const dtTrashClass =
  'dt-trash ml-[0.25rem] inline-flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-[0.85rem] leading-none text-muted [transition:color_.12s,background_.12s] hover:bg-danger-soft/10 hover:text-danger-soft';

/** `.dt-meta` */
export const dtMetaClass = 'dt-meta ml-auto whitespace-nowrap text-[0.73rem] text-secondary';

/** `.dt-meta-controls` */
export const dtMetaControlsClass =
  'dt-meta-controls ml-auto flex shrink-0 flex-nowrap items-center gap-[0.3rem]';

/** `.dt-meta-lbl` */
export const dtMetaLblClass =
  'dt-meta-lbl shrink-0 whitespace-nowrap text-[0.73rem] text-secondary';

/** `.dt-meta-sep` */
export const dtMetaSepClass =
  'dt-meta-sep shrink-0 px-[0.1rem] text-[0.73rem] text-border-strong';

/** `.dt-meta-user` */
export const dtMetaUserClass = 'dt-meta-user text-primary';

/**
 * `.dt-meta-controls input.dt-ctrl-num` — width keeps its legacy
 * `!important` so it still wins over the 68px inline width on the income
 * filter input (the legacy cascade outcome).
 */
export const dtCtrlNumClass =
  'dt-ctrl-num w-[52px]! shrink-0 rounded-sm border border-border-strong bg-border-default px-[0.3rem] py-[0.2rem] text-[0.76rem] text-primary outline-none focus:border-accent-soft';

/** `.dt-meta-controls select.dt-ctrl-sel` */
export const dtCtrlSelClass =
  'dt-ctrl-sel w-auto max-w-[160px] shrink-0 cursor-pointer rounded-sm border border-border-strong bg-border-default px-[0.3rem] py-[0.2rem] text-[0.76rem] text-primary outline-none focus:border-accent-soft';

/** `.dt-meta-controls input.dt-ctrl-date` (+ its :disabled rule). NB: no
 *  focus:border-* utility — the legacy global focus rule only covered
 *  select/number inputs, so date inputs keep the base layer's accent. */
export const dtCtrlDateClass =
  'dt-ctrl-date w-[112px]! shrink-0 cursor-pointer rounded-sm border border-border-strong bg-border-default px-[0.3rem] py-[0.2rem] text-[0.76rem] text-primary outline-none disabled:cursor-not-allowed disabled:opacity-40';

/** `.dt-ctrl-now-wrap` */
export const dtCtrlNowWrapClass =
  'dt-ctrl-now-wrap flex shrink-0 cursor-pointer select-none items-center gap-[0.25rem] whitespace-nowrap text-[0.73rem] text-secondary';

/** `.dt-ctrl-now-wrap input[type=checkbox]` */
export const dtCtrlNowCheckboxClass = 'h-[13px] w-[13px] shrink-0 cursor-pointer accent-accent';

/** `.dt-status` */
export const dtStatusClass =
  'dt-status min-h-[1.1em] px-[0.75rem] py-[0.2rem] text-[0.68rem] text-muted';

/** `.dt-nodata` / `.db-nodata` (identical legacy rules) */
export const dtNodataClass = 'dt-nodata p-[1.5rem] text-center text-[0.85rem] text-border-strong';

/** `.dt-daterange` */
export const dtDaterangeClass =
  'dt-daterange min-h-[1.1em] border-b border-b-card bg-page px-[0.75rem] py-[0.2rem] text-[0.68rem] text-muted';

/** `.dt-chart` / `.di-chart` (identical legacy rules) */
export const dtChartClass = 'dt-chart relative w-full';

/** The shared manage-modal chrome (the former .dp-modal-* rules of
 *  styles/widgets.css) — rendered by both PositionsManageModal and
 *  PositionsConfigPreviewModal. */
export const dpModalChrome = {
  /** `.dp-modal-ovl` (the preview overlay overrides z-index inline). */
  ovl: 'dp-modal-ovl fixed inset-0 z-[30000] block bg-[rgba(5,8,14,0.72)] p-4 backdrop-blur-[2px]',
  /** `.dp-modal-head` (drag handle of the manage modal). */
  head: 'dp-modal-head flex cursor-move select-none items-center justify-between gap-[0.5rem] border-b border-b-border-subtle bg-card px-[1rem] py-[0.75rem]',
  /** `.dp-modal-title` */
  title: 'dp-modal-title text-[0.9rem] font-bold text-primary',
  /** `.dp-modal-close` (+ hover) */
  close:
    'dp-modal-close cursor-pointer rounded-[5px] border-0 bg-transparent px-[0.35rem] py-[0.2rem] text-[1rem] text-muted hover:bg-white/6 hover:text-primary',
  /** `.dp-modal-body` */
  body: 'dp-modal-body flex min-h-0 flex-1 flex-col gap-[0.7rem] overflow-hidden p-[0.85rem]',
  /** `.dp-modal-actions` */
  actions: 'dp-modal-actions flex flex-wrap items-center justify-end gap-[0.5rem]',
  /** `.dp-status-msg` base (the ok/err tone variants append utilities). */
  statusMsg: 'dp-status-msg min-h-[1.2em] text-[0.76rem] leading-[1.4] text-secondary',
};
