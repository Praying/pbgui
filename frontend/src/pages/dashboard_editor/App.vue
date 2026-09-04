<script setup lang="ts">
/*
 * dashboard_editor migration — D-editor-3 shell
 * (source: frontend/dashboard_editor.html, kept as the legacy fallback)
 *
 * Behavior inventory: the editor SHELL around D-editor-2's grid:
 *
 * ┌──────────────────────┬───────────────────────────────────────────────────┐
 * │ App (shell)          │ body mode classes (editor:2639-2641), init:      │
 * │                      │ users → config (editor:2636-2705), status state, │
 * │                      │ doSave/doCancel + the postMessage contract       │
 * │                      │ (editor:2707-2742), dropdown close-on-click      │
 * │                      │ (editor:2744-2747), /ws/dashboard orchestration  │
 * │                      │ (editor:2749-2826, composables/useDashboardWs)   │
 * │ EditorHeader         │ name field, layout picker, status, palette       │
 * │ EditorGrid/GridCell  │ D-editor-2 grid + widget registry dispatch       │
 * │ GridFooter           │ add/remove row                                   │
 * ├──────────────────────┴───────────────────────────────────────────────────┤
 * Shell boundary (intentional): AppShell and StatusStrip are not rendered
 * because this document is both dashboard_main's editor iframe and the
 * standalone editor route. Its token-derived API boundary and postMessage
 * contract are retained; a second rail would break iframe sizing and editor
 * body-mode CSS.
 *
 * │ NOT PORTED (with justification):                                        │
 * │ - #standalone-toolbar div: permanently empty in legacy (editor:472,     │
 * │   328) — dead DOM, not emitted.                                         │
 * │ - %%EDIT_ONLY_STYLE%% inline hides: body.view-mode CSS rules already    │
 * │   hide the sticky top + grid footer (App.vue's style block).             │
 * │ - The legacy page kept its document click listener and WebSocket IIFE   │
 * │   forever; Vue removes both on unmount (R4-style leak fix).             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Deliberate deviations (documented):
 * - Body mode classes are removed on unmount (legacy never removed them);
 *   observable behavior while mounted is identical.
 * - init logs its error to console.error like legacy (editor:2696) and
 *   still renders the fresh grid.
 * - The WS is created in setup (legacy connected in an IIFE at script
 *   load — same observable timing, first render).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ErrorState from '@/shared/components/ErrorState.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import EditorGrid from './components/EditorGrid.vue';
import EditorHeader from './components/EditorHeader.vue';
import GridFooter from './components/GridFooter.vue';
import { readEditorConfig } from './config';
import { useDashboardUsers } from './composables/useDashboardUsers';
import { useDashboardWs } from './composables/useDashboardWs';
import { closeAllMselDropdowns } from './lib/mselRegistry';
import { isPositionsLive } from './lib/livePositionsRegistry';
import { useDashboardStore } from './stores/dashboardStore';
import { inboundMessageType, type EditorOutboundMessage } from './types/postMessage';

const { t } = useI18n();

/* ── legacy injected config (%%API_BASE%% etc., editor:493-497) ── */

const config = readEditorConfig();
const store = useDashboardStore(config);
const users = useDashboardUsers();

/* ── status badge (legacy setStatus, editor:541-544) ── */

const statusMsg = ref('');
const statusCls = ref('');
/** Bumped after store.loadConfig — triggers the legacy editor:2688 input
 *  rewrite in EditorHeader. */
const configRevision = ref(0);

function setStatus(msg: string, cls: string): void {
  statusMsg.value = msg;
  statusCls.value = cls;
}

/* Mirror doSync's statuses (editor:600-610) into the badge; doSave writes
   its own statuses directly — both drive the same element in legacy. */
watch(
  () => store.syncStatus,
  (status) => {
    if (status === 'saving') setStatus(t('dash.saving'), '');
    else if (status === 'saved') setStatus(t('dash.saved'), 'saved');
    else if (status === 'error') setStatus(t('dash.statusError'), 'error');
    else if (status === 'offline') setStatus(t('dash.offline'), 'error');
    else setStatus('', '');
  }
);

/* ── init (editor:2636-2705) ── */

/** Set when init() throws — the editor area renders ErrorState (with a
 *  retry that re-runs init) instead of a fresh grid the user cannot tell
 *  apart from a working empty dashboard. */
const initError = ref('');
/* TODO(i18n): add dedicated dash.initFailed / dash.retry keys; borrowing
   dash.statusError + ai.chat.retry until then (en-only fallbacks below). */
const INIT_ERROR_TITLE_FALLBACK = 'Failed to load dashboard';

interface LoadedConfig {
  found: boolean;
  config: Record<string, unknown> | null;
}

async function loadInitialConfig(): Promise<LoadedConfig> {
  /* view mode: load the saved config directly (editor:2650-2653) */
  if (config.viewOnly && config.origName) {
    const r = await fetch(`${config.apiBase}/dashboards/${encodeURIComponent(config.origName)}`);
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as { config?: unknown };
    return { found: !!(d && d.config), config: (d.config as Record<string, unknown>) || null };
  }
  /* edit mode: pending first, saved fallback (editor:2656-2670) */
  const r = await fetch(
    `${config.apiBase}/dashboard/pending_full?name=${encodeURIComponent(config.origName)}`
  );
  const pending = r.ok
    ? ((await r.json()) as LoadedConfig)
    : { found: false, config: {} };
  if (pending.found && pending.config && Object.keys(pending.config).length > 0) {
    return pending;
  }
  if (!config.origName) return { found: false, config: {} };
  const r2 = await fetch(`${config.apiBase}/dashboards/${encodeURIComponent(config.origName)}`);
  const saved = r2.ok ? ((await r2.json()) as LoadedConfig) : { found: false, config: {} };
  if (saved && saved.config && Object.keys(saved.config).length > 0) {
    return { found: true, config: saved.config };
  }
  return { found: false, config: {} };
}

async function init(): Promise<void> {
  /* editor:2639-2641 — body classes drive every view/standalone CSS rule */
  if (config.viewOnly) document.body.classList.add('view-mode');
  if (config.standalone) document.body.classList.add('standalone-mode');
  document.title = t('dash.editorTitle');
  document.addEventListener('click', onDocClick);

  await users.loadUsers(config.apiBase); // editor:2644-2647
  try {
    const loaded = await loadInitialConfig();
    if (loaded.found && loaded.config && Object.keys(loaded.config).length > 0) {
      store.loadConfig(loaded.config); // editor:2680-2684 (clamps inside)
    } else {
      store.loadConfig({}); // editor:2686 — fresh {name, 1, 1}
    }
  } catch (e) {
    console.error('editor init error', e); // editor:2696
    store.loadConfig({}); // editor:2697
    initError.value = e instanceof Error ? e.message : String(e);
  }
  configRevision.value++; // editor:2688 — the header name input re-syncs
}

/** ErrorState retry — re-runs init from the top (listeners/classes are
 *  idempotent: same-function addEventListener and classList.add no-op). */
function retryInit(): void {
  initError.value = '';
  void init();
}

/* ── save / cancel + the parent message contract (editor:2707-2742) ── */

function postParent(msg: EditorOutboundMessage): void {
  try {
    window.parent.postMessage(msg, '*');
  } catch {
    /* cross-origin postMessage failures are swallowed (store parity) */
  }
}

async function doSave(): Promise<void> {
  closeAllMselDropdowns(); // editor:2709
  const name = String(store.state.name ?? '').trim();
  if (!name) {
    setStatus(t('dash.enterDashboardName'), 'error'); // editor:2710-2711
    return;
  }
  setStatus(t('dash.saving'), '');
  const payload = store.serialize();
  try {
    const r = await fetch(`${config.apiBase}/dashboards/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      setStatus(t('dash.saved'), 'saved');
      postParent({ type: 'pbgui_editor_saved', name });
    } else {
      setStatus(t('dash.statusError'), 'error');
    }
  } catch {
    setStatus(t('dash.offline'), 'error');
  }
}

function doCancel(): void {
  postParent({ type: 'pbgui_editor_cancelled', original_name: config.origName });
}

function onParentMessage(e: MessageEvent): void {
  const type = inboundMessageType(e.data);
  if (type === null) return; // editor:2734 — non-object data ignored
  if (type === 'pbgui_trigger_cancel') doCancel();
  else if (type === 'pbgui_trigger_save') void doSave();
  else if (type === 'pbgui_trigger_view_save') void store.saveViewLayout();
}

/* ── dropdown close-on-click (editor:2744-2747) ── */

function onDocClick(): void {
  closeAllMselDropdowns();
}

/* ── WebSocket orchestration (editor:2749-2826) ── */

/* editor:2807 — positions_updated skips cells whose live poll is active
   (`_liveState['pos_' + r + '_' + c].timer`); D-editor-5's WidgetPositions
   maintains the registry (lib/livePositionsRegistry). */
useDashboardWs({ apiBase: config.apiBase, store, isPositionsLive });

/* The parent-message listener attaches at load like the legacy page
   (editor:2733), before init runs. Message events fire on window — the
   legacy listener was window.addEventListener. */
window.addEventListener('message', onParentMessage);

/* ── lifecycle ── */

onMounted(() => {
  void init();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  window.removeEventListener('message', onParentMessage);
  document.body.classList.remove('view-mode', 'standalone-mode');
});
</script>

<template>
  <MigrationWatermark />
  <div class="editor-wrapper flex h-[85vh] flex-col overflow-hidden p-[var(--page-padding)]">
    <div class="editor-sticky-top mb-[0.5rem] shrink-0">
      <EditorHeader :msg="statusMsg" :cls="statusCls" :config-revision="configRevision" />
    </div>
    <div class="editor-scroll-area min-h-0 flex-1 overflow-y-auto">
      <ErrorState
        v-if="initError"
        :title="INIT_ERROR_TITLE_FALLBACK"
        :message="initError"
        :retry-label="t('ai.chat.retry')"
        @retry="retryInit"
      />
      <template v-else>
        <EditorGrid />
        <GridFooter />
      </template>
    </div>
  </div>
</template>

<style>
/* ═══════════════════════════════════════════════════════════════
   Ported from styles/editor.css + styles/widgets.css (both deleted
   at the Tailwind migration). Everything expressible as utilities
   moved onto the component templates; the rules below stay CSS for
   the documented reasons. The block is unscoped on purpose — the
   old stylesheets were page-global, and the body/html rules have
   no component root.

   Dropped outright (dead DOM — the Vue port never renders it):
   .hdr-sep, .cell-header/.drag-handle/.cell-cfg (display:none in
   legacy), .cfg-row/.cfg-grid, the .orders-link-* link-chip picker,
   .type-badge.type-*, .cell-trash, #standalone-toolbar, the legacy
   .db-msel-* dropdown duplicates and .db-sort-arrow/.db-sorted.
   Dropped as duplicates of the shared src/styles/tailwind.css: the
   :root fs/sp/input/btn aliases, the * reset, the body font-size/
   background/colour defaults (only the legacy font stack differs,
   kept below), and the empty .editor-grid.cols-1/cols-2 rules.
   ═══════════════════════════════════════════════════════════════ */

/* The legacy editor page used the plain system stack, not the shared
   Space Grotesk face — keep that difference (un-layered CSS beats the
   base layer's font-family). */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif;
}

/* ── Standalone mode (App toggles body.standalone-mode) ────────── */
body.standalone-mode .editor-wrapper {
  height: 100dvh;
}

/* ── View-only mode: hide editing chrome (legacy editor.css:311-322) ──
   Un-layered CSS beats the templates' utilities, so the gap:0 and
   padding overrides below win over the cell/wrapper utilities. */
body.view-mode .editor-sticky-top,
body.view-mode #grid-footer {
  display: none !important;
}
body.view-mode .editor-wrapper {
  height: 100dvh;
  padding: 0.5rem;
}
body.view-mode .cell-inline-preview {
  min-height: 320px;
}
body.view-mode .editor-cell {
  cursor: default !important;
  gap: 0;
  min-height: 360px;
}

/* ── Plotly modebar — shared rule covering both widget roots ─────
   Targets DOM that Plotly injects inside the chart divs; no utility
   form exists. */
.dt-root .modebar-container .modebar,
.di-root .modebar-container .modebar {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
}
.dt-root .modebar-container .modebar-group,
.di-root .modebar-container .modebar-group {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
}
.dt-root .modebar-container,
.di-root .modebar-container {
  position: absolute !important;
  right: 0 !important;
  top: 0 !important;
}

/* ── Fullscreen — shared (no :fullscreen utility variant) ──────── */
.dt-root:fullscreen,
.di-root:fullscreen {
  border-radius: 0;
  width: 100vw;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}
.dt-root:fullscreen .dt-chart,
.di-root:fullscreen .di-chart {
  flex: 1;
}
.dt-root:-webkit-full-screen,
.di-root:-webkit-full-screen {
  border-radius: 0;
  width: 100vw;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}
.dt-root:-webkit-full-screen .dt-chart,
.di-root:-webkit-full-screen .di-chart {
  flex: 1;
}
/* the orders chart inside a fullscreened widget root. The wrap's own
   :fullscreen twin is kept from the legacy sheet — the .do-fullscreen
   class (WidgetOrders' chartWrapClass) covers the class-driven half. */
.dt-root:fullscreen .do-chart-wrap,
.dt-root:-webkit-full-screen .do-chart-wrap {
  flex: 1;
  height: auto !important;
  position: relative !important;
}
.do-chart-wrap:fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw !important;
  height: 100dvh !important;
  z-index: var(--z-modal);
  border-radius: 0;
  background: var(--bg-page);
}
</style>
