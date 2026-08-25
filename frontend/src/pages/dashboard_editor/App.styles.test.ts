import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* The former styles/editor.css and styles/widgets.css (frozen SHA ports of
   the legacy <style> block and the render-engine _CSS array) were deleted
   at the Tailwind migration: everything expressible as utilities moved onto
   the component templates (helpers in components/widgets/uiClasses.ts), and
   the rules that must stay CSS live in the components' style blocks:

     App.vue (unscoped)      body font stack, standalone/view-mode chrome,
                             the Plotly modebar rules, the :fullscreen groups
     GridCell.vue (scoped)   the cell→widget flex chain + header drag cursor
     ResizeHandle.vue        the ::after grip + hover/active button reveal
     StatusBadge.vue         the .status tone rules (class list pinned by tests)
     MultiSelectDropdown.vue the .dt-meta-controls host-sizing contract
     WidgetBalance / WidgetPositions / IncomeTable / PositionsManageModal
                             the tr:hover/tr.selected td row-state groups

   Form controls (buttons, inputs, selects, checkboxes) migrated to the
   shared ui/ layer: the legacy chrome utilities left uiClasses.ts and the
   modal button CSS left PositionsManageModal; the legacy class names ride
   along as inert anchors the tests select.

   This suite replaces the SHA freeze: it pins the migration's structural
   contracts — the engine class names the tests select, the token mapping
   the old --db-* variable system encoded, and the CSS that had to stay. */

const pageRoot = import.meta.dirname;

function read(relative: string): string {
  return readFileSync(join(pageRoot, relative), 'utf8');
}

function readComponent(relative: string): string {
  return read(join('components', relative));
}

function readWidget(relative: string): string {
  return read(join('components', 'widgets', relative));
}

/** The <style> blocks of a Vue SFC (scoped and unscoped alike). */
function styleBlocks(source: string): string {
  return (source.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? []).join('\n');
}

describe('editor styles migration — engine class anchors', () => {
  /* The legacy editor.css checklist (grid/cell/resize engine classes the
     drag+resize machinery and the tests depend on) now lives as template
     anchors: the class names must keep appearing on the components. */
  it('keeps the grid/cell/resize engine classes on the components', () => {
    expect(readComponent('EditorGrid.vue')).toContain('editor-grid');
    expect(readComponent('EditorGrid.vue')).toContain("cols-' + store.cols");
    expect(readComponent('GridColumn.vue')).toContain('editor-grid-col');
    expect(readComponent('GridCell.vue')).toContain('editor-cell');
    expect(readComponent('GridCell.vue')).toContain('drop-hint');
    expect(readComponent('GridCell.vue')).toContain('cell-inline-preview');
    expect(readComponent('GridCell.vue')).toContain("'drag-over border-dashed");
    expect(readComponent('GridCell.vue')).toContain("'dragging opacity-40");
    expect(readComponent('GridCell.vue')).toContain("'auto-height min-h-0!'");
    expect(readComponent('ResizeHandle.vue')).toContain('resize-handle');
    expect(readComponent('ResizeHandle.vue')).toContain('resize-btn-min');
    expect(readComponent('ResizeHandle.vue')).toContain('resize-btn-max');
    expect(readComponent('LayoutPicker.vue')).toContain('lt-thumb');
    expect(readComponent('LayoutPicker.vue')).toContain('lt-dim');
    expect(readComponent('LayoutPicker.vue')).toContain('lt-cell');
    expect(readComponent('PaletteBar.vue')).toContain('palette-item');
    expect(readComponent('PaletteBar.vue')).toContain('palette-label');
    expect(readComponent('MultiSelectDropdown.vue')).toContain('msel-drop');
    expect(readComponent('MultiSelectDropdown.vue')).toContain('msel-item');
    expect(readComponent('MultiSelectDropdown.vue')).toContain("'selected bg-accent/12");
    expect(readComponent('GridFooter.vue')).toContain('grid-footer-btn');
    expect(readComponent('EditorHeader.vue')).toContain('editor-header');
    expect(readComponent('EditorHeader.vue')).toContain('hdr-field');
    expect(read('App.vue')).toContain('editor-wrapper');
    expect(read('App.vue')).toContain('editor-sticky-top');
    expect(read('App.vue')).toContain('editor-scroll-area');
  });

  it('keeps the shell import order (tailwind.css before the page bundle)', () => {
    expect(read('main.ts')).toContain("import '@/styles/tailwind.css';");
  });

  it('keeps the legacy status badge class contract (class list pinned by tests)', () => {
    const status = readComponent('StatusBadge.vue');
    expect(status).toContain('class="status"');
    expect(styleBlocks(status)).toContain('.status.saved');
    expect(styleBlocks(status)).toContain('.status.error');
  });

  it('keeps the view-mode and standalone document chrome as CSS', () => {
    const appStyles = styleBlocks(read('App.vue'));
    for (const anchor of [
      'body.standalone-mode .editor-wrapper',
      'body.view-mode .editor-sticky-top',
      'body.view-mode #grid-footer',
      'body.view-mode .editor-wrapper',
      'body.view-mode .cell-inline-preview',
      'body.view-mode .editor-cell',
    ]) {
      expect(appStyles).toContain(anchor);
    }
    /* the legacy font stack — the page must not silently adopt the shared
       Space Grotesk face */
    expect(appStyles).toContain('-apple-system, BlinkMacSystemFont');
  });

  it('keeps the cell→widget flex chain and header drag cursor as engine CSS', () => {
    const cellStyles = styleBlocks(readComponent('GridCell.vue'));
    expect(cellStyles).toContain('.cell-inline-preview > :deep(.dt-root)');
    expect(cellStyles).toContain('.cell-inline-preview > :deep(.di-root)');
    expect(cellStyles).toContain('.cell-inline-preview :deep(.dt-chart)');
    expect(cellStyles).toContain('.cell-inline-preview :deep(.di-chart)');
    expect(cellStyles).toContain(':deep(.dt-header)');
    expect(cellStyles).toContain(':deep(.db-header)');
    expect(cellStyles).toContain('.editor-cell.dragging :deep(.dt-header)');
    expect(cellStyles).toContain('cursor: grab');
    expect(cellStyles).toContain('cursor: grabbing');
  });

  it('keeps the resize grip pseudo-element rules', () => {
    const handleStyles = styleBlocks(readComponent('ResizeHandle.vue'));
    expect(handleStyles).toContain('.resize-handle::after');
    expect(handleStyles).toContain('.resize-handle:hover .resize-btn');
    expect(handleStyles).toContain('.resize-handle.active .resize-btn');
  });
});

describe('widgets styles migration — token mapping contracts', () => {
  it('maps the widget chrome onto the shared token utilities (the --db-* aliases)', () => {
    /* The legacy :root{--db-*} block aliased the global tokens
       (--db-bg:var(--bg-page), --db-surface:var(--bg-card), …). With the
       variable system deleted the equivalent mapping is the utility set
       itself — pin the palette values the widgets must keep using. */
    const uiClasses = readWidget('uiClasses.ts');
    expect(uiClasses).toContain('bg-page'); // --db-bg / widget backgrounds
    expect(uiClasses).toContain('bg-card'); // --db-surface (header fills)
    /* --db-surface2/--db-surface3 (control fills/borders) moved into the
       shared ui/ control chrome with the button/input/select migration */
    expect(uiClasses).toContain('text-primary'); // --db-text
    expect(uiClasses).toContain('text-secondary'); // --db-text-muted
    expect(uiClasses).toContain('text-muted'); // --db-text-dim
    expect(uiClasses).toContain('text-accent-soft'); // --db-title
    expect(uiClasses).toContain('rounded-md'); // --db-radius (6px)
    expect(uiClasses).toContain('font-sans'); // --db-font
    /* --db-pos/--db-neg/--db-warn (success-soft/danger-soft/warning-soft)
       live in the component tone ternaries, not the shared chrome set */
    expect(readWidget('IncomeTable.vue')).toContain('text-warning-soft');
    expect(readWidget('IncomeTable.vue')).toContain("'di-inc-pos text-success-soft'");
    expect(readWidget('IncomeTable.vue')).toContain("'di-inc-neg text-danger-soft'");
    expect(readWidget('WidgetPositions.vue')).toContain("'dp-upnl-pos text-success-soft'");
    expect(readWidget('WidgetPositions.vue')).toContain("'dp-upnl-neg text-danger-soft'");
    /* no --db-* variable is REFERENCED anywhere in the page (the mapping
       comments may still name the legacy aliases) */
    for (const file of [
      'App.vue',
      'components/widgets/uiClasses.ts',
      'components/widgets/PositionsManageModal.vue',
      'components/widgets/WidgetBalance.vue',
    ]) {
      expect(read(file)).not.toContain('var(--db-');
    }
  });

  it('keeps the legacy widget chrome classes as template anchors', () => {
    expect(readWidget('WidgetBalance.vue')).toContain('db-root');
    expect(readWidget('WidgetBalance.vue')).toContain('db-header');
    expect(readWidget('uiClasses.ts')).toContain('dt-header');
    expect(readWidget('uiClasses.ts')).toContain('dt-trash');
    expect(readWidget('uiClasses.ts')).toContain('dt-root');
    expect(readWidget('uiClasses.ts')).toContain('di-root');
    expect(readWidget('IncomeTable.vue')).toContain('di-table');
    expect(readWidget('PositionsManageModal.vue')).toContain('dp-modal');
    expect(readWidget('WidgetOrders.vue')).toContain('do-chart-wrap');
    expect(readWidget('PlotlyChart.vue')).toContain('dt-fs-close');
  });

  it('keeps the host-context dropdown sizing contract', () => {
    const dropdown = readComponent('MultiSelectDropdown.vue');
    expect(styleBlocks(dropdown)).toContain('.dt-meta-controls .msel-wrap');
    expect(styleBlocks(dropdown)).toContain('.dt-meta-controls .msel-btn');
  });

  it('keeps the row-state groups that paint td descendants', () => {
    expect(styleBlocks(readWidget('WidgetBalance.vue'))).toContain('.db-table tbody tr:hover td');
    expect(styleBlocks(readWidget('WidgetPositions.vue'))).toContain('.dp-table tr:hover td');
    expect(styleBlocks(readWidget('WidgetPositions.vue'))).toContain('.dp-table tr.dp-sel td');
    expect(styleBlocks(readWidget('IncomeTable.vue'))).toContain('.di-table tbody tr:hover td');
    expect(styleBlocks(readWidget('IncomeTable.vue'))).toContain('.di-table tr.di-sel td');
    expect(styleBlocks(readWidget('IncomeTable.vue'))).toContain(
      '.di-table tr.di-sel td:first-child',
    );
    expect(styleBlocks(readWidget('PositionsManageModal.vue'))).toContain(
      '.dp-manage-table tr.dp-sel td',
    );
  });

  it('keeps the modal run-button tone anchors as inert classes on ui/Button', () => {
    /* The .dp-row-run/.dp-quick/.dp-modal-actions CSS system left with the
       ui/Button migration; lib/manageLogic's runClass strings (and the
       footer's danger/warn/ok) ride on the components as test anchors. */
    const modal = readWidget('PositionsManageModal.vue');
    expect(modal).toContain('dp-row-run');
    expect(modal).toContain('runVariant');
    expect(modal).toContain('class="danger"');
    expect(modal).toContain('class="warn"');
    expect(modal).toContain('class="ok"');
    /* the row-state group stays CSS */
    expect(styleBlocks(modal)).toContain('.dp-manage-table tr.dp-sel td');
  });

  it('keeps the Plotly modebar and fullscreen rules as document CSS', () => {
    const appStyles = styleBlocks(read('App.vue'));
    expect(appStyles).toContain('.dt-root .modebar-container .modebar');
    expect(appStyles).toContain('.di-root .modebar-container .modebar');
    expect(appStyles).toContain('.dt-root:fullscreen');
    expect(appStyles).toContain('.di-root:fullscreen');
    expect(appStyles).toContain('.dt-root:-webkit-full-screen');
    expect(appStyles).toContain('.dt-root:fullscreen .do-chart-wrap');
  });

  it('keeps the dynamic tone mappings as complete class sets', () => {
    /* The dynamic class strings must come from mapping helpers that return
       the FULL colour set per branch (Tailwind emits same-property
       utilities in its own fixed order). Control-tone helpers (diBtnClass,
       tfBtnClass) left with the ui/Button migration — the legacy tone class
       names ride on the components as inert anchors. */
    const income = readWidget('IncomeTable.vue');
    expect(income).toContain("'di-inc-pos text-success-soft'");
    expect(income).toContain("'di-inc-neg text-danger-soft'");
    expect(income).toContain('di-btn-danger');
    expect(income).toContain('di-btn-yes');
    const orders = readWidget('WidgetOrders.vue');
    expect(orders).toContain('do-tf-btn');
    expect(orders).toContain('do-tf-active');
    expect(orders).toContain('function upnlToneClass(cls: string | undefined)');
    expect(orders).toContain("'dt-pos text-success'");
    const modal = readWidget('PositionsManageModal.vue');
    expect(modal).toContain('function resizeHandleClass(dir: string)');
    expect(modal).toContain("'dp-resize-handle dp-resize-' + dir");
    expect(modal).toContain("case 'se'");
  });

  it('keeps the income widget header controls on the shared class sets', () => {
    const uiClasses = readWidget('uiClasses.ts');
    expect(uiClasses).toContain('w-[52px]!'); // dt-ctrl-num beats the 68px inline width
    expect(uiClasses).toContain('w-[112px]!'); // dt-ctrl-date
    expect(uiClasses).toContain('max-w-[160px]'); // dt-ctrl-sel
  });
});
