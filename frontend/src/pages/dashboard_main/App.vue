<script setup lang="ts">
/*
 * dashboard_main migration — legacy function → component mapping
 * (source: frontend/dashboard_main.html, kept as the legacy fallback)
 *
 * Behavior inventory: dashboard_main is a dashboard MANAGER SHELL — it has
 * ZERO dependency on dashboard_render.js (the grid engine lives in
 * dashboard_editor.html, served at /api/dashboard/editor_page and loaded via
 * iframe; that page and its engine are untouched by this migration).
 *
 * ┌────────────────────────┬────────────────────────────────────────────────────┐
 * │ App (shell)            │ apiFetch, loadView, loadEditor, refreshList,        │
 * │                        │ updateViewSaveBtn, renderToolbar, pruneSelected-    │
 * │                        │ Dashboards, getDeleteTargets, setDashboardSelected, │
 * │                        │ selectSingleDashboard, updateCount, openNewDash-    │
 * │                        │ Dialog, openDeleteDialog, openTemplates, both       │
 * │                        │ postMessage listeners, sidebar-resize IIFE, help    │
 * │                        │ IIFE public opener (window.PBGUI_HELP_OPENER)       │
 * │ DashboardList          │ buildList, renderList, applySidebarDragAt,          │
 * │                        │ onSidebarDragMove/Up, list click/mousedown/keydown  │
 * │ NewDashboardDialog     │ new-dash-dialog open/OK/cancel/Enter/Escape         │
 * │ DeleteDialog           │ del-dash-dialog markup + openDeleteDialog text      │
 * │ TemplatesOverlay       │ tpl overlay + drag-to-move IIFE                     │
 * ├────────────────────────┴────────────────────────────────────────────────────┤
 * │ NOT PORTED (with justification):                                            │
 * │ - in-page #help-ovl IIFE (mdToHtml, renderToc, loadTopic, loadHelpIndex,    │
 * │   EN/DE pill, drag-to-move): dead UI — nothing ever adds .visible to        │
 * │   #help-ovl; the nav Guide button opens the SHARED overlay via              │
 * │   window.PBGUI_HELP_OPENER → PBGuiSharedHelp.open (shared_help_overlay.js). │
 * │   Only the public opener is ported.                                         │
 * │ - WS_BASE / %%WS_BASE%%: injected but never read anywhere in the page.      │
 * │ - #rename-dialog CSS: no markup and no JS uses it (dead CSS only).          │
 * │ - #help-ovl / #about-ovl CSS: dead overlay chrome (see above).              │
 * │ - escHtml/escAttr: Vue interpolation escapes by construction; no v-html.    │
 * │ - pbgui_nav.js / pbgui_dialogs.js / i18n.js / shared_help_overlay.js stay  │
 * │   as shared legacy scripts loaded by index.html.                            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Deliberate deviations (documented):
 * - The shared help opener passes { token } (services_monitor convention) —
 *   legacy called PBGuiSharedHelp.open('dashboard') without options and relied
 *   on the global window.TOKEN fallback, which dashboard_main never set.
 * - The initial dashboard list is fetched (legacy rendered the injected
 *   %%DASHBOARDS_JSON%% first and replaced it with the same GET /dashboards);
 *   a non-ok response clears the list, a network failure keeps the old one.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  PhArchive,
  PhArrowClockwise,
  PhFloppyDisk,
  PhMagnifyingGlass,
  PhPencilSimple,
  PhPlus,
  PhTrash,
  PhX,
} from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { aiFocusedField, useAiPageContext } from '@/shared/ai/context';
import { ApiError, apiFetch } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import AppShell from '@/shared/components/AppShell.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import DashboardList from './components/DashboardList.vue';
import DeleteDialog from './components/DeleteDialog.vue';
import NewDashboardDialog from './components/NewDashboardDialog.vue';
import TemplatesOverlay from './components/TemplatesOverlay.vue';
import { dashboardsUrl, editorPageUrl, templatesPageUrl } from './config';
import type { DashboardsResponse, EditorMessage } from './types';

const { t } = useI18n();

/** Legacy %%CURRENT%%: the `current` query param of /api/dashboard/main_page. */
function initialCurrent(): string {
  return new URLSearchParams(window.location.search).get('current') ?? '';
}

const dashboards = ref<string[]>([]);
const query = ref('');
const currentDash = ref(initialCurrent());
const editMode = ref(false);
const viewDirty = ref(false);
/** Legacy selectedDashboards. */
const selected = ref<string[]>(currentDash.value ? [currentDash.value] : []);

/* AI drawer page context — Vue port of the legacy dashboards registration
   (selected/viewed dashboards as entities, list filter as focused field). */
useAiPageContext({
  id: 'dashboards',
  getContext: () => {
    const names = selected.value.length ? selected.value : currentDash.value ? [currentDash.value] : [];
    return {
      section: 'Dashboards',
      entities: names.slice(0, 8).map((name) => ({ kind: 'dashboard', name })),
      focused_field: aiFocusedField({
        'sidebar-search': { path: 'dashboard.filter', label: 'Dashboard filter' },
      }),
    };
  },
});
const frameLoading = ref(true);
const frameVisible = ref(false);
const frameSrc = ref('');
/** Legacy _pendingDelete. */
const delNames = ref<string[]>([]);
const delDialogVisible = ref(false);
const newDialogVisible = ref(false);
const tplVisible = ref(false);
const tplUrl = ref('');

const frameEl = ref<HTMLIFrameElement | null>(null);
const sidebarEl = ref<HTMLElement | null>(null);

/** Legacy renderList filter (search input → filtered names). */
const filteredNames = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? dashboards.value.filter((name) => name.toLowerCase().includes(q)) : dashboards.value;
});

/** Legacy updateCount: filtered/total while searching, total otherwise. */
const countText = computed(() =>
  query.value.trim() ? `${filteredNames.value.length}/${dashboards.value.length}` : String(dashboards.value.length)
);

/** Legacy updateCount: the search box appears at four dashboards or more. */
const showSearch = computed(() => dashboards.value.length >= 4);

/** Legacy updateViewSaveBtn visibility rule. */
const showViewSave = computed(() => viewDirty.value && !editMode.value && currentDash.value !== '');

/** Legacy contentFrame.onload was only attached inside loadView/loadEditor. */
let frameStarted = false;

/* ── List + selection (legacy refreshList/prune/getDeleteTargets/set/select) ── */

/** Legacy refreshList: replace the list, prune selection, run the callback. */
async function refreshList(thenLoad?: () => void): Promise<void> {
  try {
    const data = await apiFetch<DashboardsResponse>(dashboardsUrl());
    dashboards.value = [...(data.dashboards ?? [])].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  } catch (error) {
    // legacy: non-ok responses cleared the list, network failures kept it
    if (error instanceof ApiError) dashboards.value = [];
  }
  pruneSelected();
  thenLoad?.();
}

/** Legacy pruneSelectedDashboards (also called from refreshList). */
function pruneSelected(): void {
  selected.value = selected.value.filter((name) => dashboards.value.includes(name));
  if (!selected.value.length && currentDash.value && dashboards.value.includes(currentDash.value)) {
    selected.value = [currentDash.value];
  }
}

/** Legacy getDeleteTargets: selected first, else the current dashboard. */
function getDeleteTargets(): string[] {
  return selected.value.length ? [...selected.value] : currentDash.value ? [currentDash.value] : [];
}

/** Legacy setDashboardSelected (idempotent add/remove). */
function setDashboardSelected(name: string, isSelected: boolean): void {
  if (!name) return;
  const ix = selected.value.indexOf(name);
  if (isSelected && ix < 0) selected.value = [...selected.value, name];
  else if (!isSelected && ix >= 0) selected.value = selected.value.filter((_, i) => i !== ix);
}

/** Legacy selectSingleDashboard: single-select and load unless already current. */
function selectSingleDashboard(name: string): void {
  if (!name) return;
  selected.value = [name];
  if (name !== currentDash.value) loadView(name);
}

/* ── Iframe view/editor (legacy loadView/loadEditor) ── */

/** Legacy loadView: view-only iframe for a dashboard. */
function loadView(name: string): void {
  if (!name) return;
  currentDash.value = name;
  if (selected.value.length <= 1) selected.value = [name];
  editMode.value = false;
  viewDirty.value = false;
  frameLoading.value = true;
  frameVisible.value = false;
  frameStarted = true;
  frameSrc.value = editorPageUrl(name, 'view');
}

/** Legacy loadEditor: standalone editor iframe. */
function loadEditor(name: string): void {
  currentDash.value = name || '';
  editMode.value = true;
  frameLoading.value = true;
  frameVisible.value = false;
  frameStarted = true;
  frameSrc.value = editorPageUrl(name || '', 'editor');
}

/** Legacy contentFrame.onload: hide the spinner, show the frame. */
function onFrameLoad(): void {
  if (!frameStarted) return;
  frameLoading.value = false;
  frameVisible.value = true;
}

/** Legacy contentFrame.contentWindow.postMessage calls. */
function postToFrame(message: { type: string }): void {
  frameEl.value?.contentWindow?.postMessage(message, '*');
}

/* ── New / delete (legacy dialogs) ── */

/** Legacy openDeleteDialog. */
function openDeleteDialog(names: string[]): void {
  delNames.value = names.slice();
  if (!delNames.value.length) return;
  delDialogVisible.value = true;
}

/** Legacy del-ok handler: DELETE each pending dashboard, refresh, reset on current. */
async function confirmDelete(): Promise<void> {
  delDialogVisible.value = false;
  const names = delNames.value.slice();
  const deletedCurrent = names.includes(currentDash.value);
  try {
    await Promise.all(
      names.map((name) => apiFetch(`${dashboardsUrl()}/${encodeURIComponent(name)}`, { method: 'DELETE' }))
    );
    selected.value = selected.value.filter((name) => !names.includes(name));
    await refreshList(() => {
      if (deletedCurrent) {
        currentDash.value = '';
        editMode.value = false;
        frameLoading.value = true;
        frameVisible.value = false;
        frameSrc.value = '';
      }
    });
  } catch {
    dialogsAlert({ title: t('dash.deleteDashboard'), message: t('dash.deleteFailed') });
  }
}

/** Legacy new-dash-ok success path: hide the dialog and open the editor. */
function createDashboard(name: string): void {
  newDialogVisible.value = false;
  loadEditor(name);
}

/* ── Templates overlay (legacy openTemplates/close handlers) ── */

/** Legacy openTemplates. */
function openTemplates(): void {
  tplUrl.value = templatesPageUrl(currentDash.value);
  tplVisible.value = true;
}

/** Legacy tpl-close / pbgui_close_templates handler: hide + clear the iframe. */
function closeTemplates(): void {
  tplVisible.value = false;
  tplUrl.value = '';
}

/* ── postMessage from the editor/templates iframes ── */

/** Legacy window message listeners (editor + templates, consolidated). */
function onWindowMessage(event: MessageEvent): void {
  const data = event.data as EditorMessage | null;
  if (!data || typeof data !== 'object') return;
  switch (data.type) {
    case 'pbgui_editor_saved': {
      const savedName = data.name || currentDash.value;
      editMode.value = false;
      void refreshList(() => loadView(savedName));
      break;
    }
    case 'pbgui_editor_cancelled': {
      editMode.value = false;
      const originalName = data.original_name || currentDash.value;
      if (originalName) {
        loadView(originalName);
      } else {
        frameLoading.value = true;
        frameVisible.value = false;
        frameSrc.value = '';
      }
      break;
    }
    case 'pbgui_view_dirty':
      viewDirty.value = true;
      break;
    case 'pbgui_view_saved':
      viewDirty.value = false;
      break;
    case 'pbgui_resize_start':
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      break;
    case 'pbgui_resize_end':
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      break;
    case 'pbgui_close_templates':
      closeTemplates();
      break;
    case 'pbgui_dashboard_created':
      // Legacy had two listeners for this type: one refreshed + loaded the
      // created name, the other closed the templates overlay and reloaded the
      // (by then updated) current dashboard — net effect below.
      closeTemplates();
      void refreshList(() => loadView(data.name || currentDash.value));
      break;
  }
}

/* ── Sidebar resize (legacy sidebar-resize IIFE, absolute clamp 160–420) ── */

const resizeActive = ref(false);

function onSidebarResizeDown(event: MouseEvent): void {
  event.preventDefault();
  resizeActive.value = true;
  document.body.style.cursor = 'col-resize';
}

/** Legacy: width follows the cursor position, clamped to 160–420px. */
function onSidebarResizeMove(event: MouseEvent): void {
  if (!resizeActive.value) return;
  const sidebar = sidebarEl.value;
  if (!sidebar) return;
  sidebar.style.width = `${Math.max(160, Math.min(420, event.clientX))}px`;
}

function onSidebarResizeUp(): void {
  resizeActive.value = false;
  document.body.style.cursor = '';
}

/* ── Legacy shared scripts bridges ── */

/** Legacy window.PBGuiDialogs.alert (pbgui_dialogs.js, loaded by index.html). */
function dialogsAlert(options: { title: string; message: string }): void {
  const dialogs = (window as Window & { PBGuiDialogs?: { alert?: (o: { title: string; message: string }) => void } }).PBGuiDialogs;
  if (dialogs?.alert) dialogs.alert(options);
}

/**
 * Legacy window._openDashboardHelp / PBGUI_HELP_OPENER: the pbgui_nav Guide
 * button calls this; it forwards the page keyword to the shared help overlay
 * script (PBGuiSharedHelp.open, loaded by index.html).
 */
function openDashboardHelp(): void {
  const sharedHelp = (window as Window & {
    PBGuiSharedHelp?: { open?: (keyword: string, opts?: { token?: string }) => void };
  }).PBGuiSharedHelp;
  if (!sharedHelp || typeof sharedHelp.open !== 'function') return;
  sharedHelp.open('dashboard', { token: getBoot().token });
}

onMounted(() => {
  document.title = t('dash.pageTitle');
  window.PBGUI_HELP_OPENER = openDashboardHelp;
  window.addEventListener('message', onWindowMessage);
  document.addEventListener('mousemove', onSidebarResizeMove);
  document.addEventListener('mouseup', onSidebarResizeUp);
  // Legacy initial render: refreshList(() => { if (CURRENT in list) loadView(CURRENT) })
  void refreshList(() => {
    if (currentDash.value && dashboards.value.includes(currentDash.value)) loadView(currentDash.value);
  });
});

onUnmounted(() => {
  window.removeEventListener('message', onWindowMessage);
  document.removeEventListener('mousemove', onSidebarResizeMove);
  document.removeEventListener('mouseup', onSidebarResizeUp);
});
</script>

<template>
  <AppShell
    class="data-page-shell data-page-shell--dashboard-main"
    page-key="dashboards"
    :page-title="t('dash.dashboards')"
  >
    <template #status>
      <StatusStrip
        :label="t('shared.status')"
        :value="frameSrc ? (frameLoading ? t('common.loading') : t('common.ok')) : t('dash.selectDashboard')"
        :tone="frameSrc ? (frameLoading ? 'warning' : 'success') : 'neutral'"
      />
    </template>

  <MigrationWatermark />
  <div id="page-body">
    <!-- ── Sidebar ── -->
    <div id="sidebar" ref="sidebarEl">
      <div id="sidebar-sticky">
        <div id="edit-mode-banner" :class="{ visible: editMode }" role="status">
          <span class="em-dot" aria-hidden="true"></span><span>{{ t('dash.editMode') }}</span>
        </div>
        <div id="sidebar-header">
          <div class="sb-heading">
            <span class="sb-title">{{ t('dash.dashboards') }}</span>
            <span class="sb-subtitle">{{ t('dash.selectDashboard') }}</span>
          </div>
          <span class="sb-count" id="sb-count" :aria-label="countText">{{ countText }}</span>
        </div>
        <div id="sidebar-toolbar">
          <template v-if="editMode">
            <button
              class="sb-btn edit-mode-save"
              id="sb-save"
              :title="t('dash.saveDashboard')"
              :aria-label="t('dash.saveDashboard')"
              @click="postToFrame({ type: 'pbgui_trigger_save' })"
            ><PbIcon :icon="PhFloppyDisk" /></button>
            <button
              class="sb-btn"
              id="sb-cancel"
              :title="t('dash.cancelEdit')"
              :aria-label="t('dash.cancelEdit')"
              @click="postToFrame({ type: 'pbgui_trigger_cancel' })"
            ><PbIcon :icon="PhX" /></button>
            <button
              class="sb-btn danger"
              id="sb-delete"
              :title="t('dash.deleteDashboard')"
              :aria-label="t('dash.deleteDashboard')"
              @click="openDeleteDialog(currentDash ? [currentDash] : [])"
            ><PbIcon :icon="PhTrash" /></button>
          </template>
          <template v-else>
            <button class="sb-btn" id="sb-refresh" :title="t('dash.refreshList')" :aria-label="t('dash.refreshList')" @click="refreshList()"><PbIcon :icon="PhArrowClockwise" /></button>
            <button class="sb-btn sb-btn--primary" id="sb-new" :title="t('dash.newDashboard')" :aria-label="t('dash.newDashboard')" @click="newDialogVisible = true"><PbIcon :icon="PhPlus" /><span class="sb-btn-label">{{ t('dash.newDashboard') }}</span></button>
            <button
              v-if="currentDash"
              class="sb-btn"
              id="sb-edit"
              :title="t('dash.editCurrentDashboard')"
              :aria-label="t('dash.editCurrentDashboard')"
              @click="loadEditor(currentDash)"
            ><PbIcon :icon="PhPencilSimple" /></button>
            <button
              v-if="getDeleteTargets().length"
              class="sb-btn danger"
              id="sb-del"
              :title="getDeleteTargets().length > 1 ? t('dash.deleteSelectedDashboards') : t('dash.deleteSelectedDashboard')"
              :aria-label="getDeleteTargets().length > 1 ? t('dash.deleteSelectedDashboards') : t('dash.deleteSelectedDashboard')"
              @click="openDeleteDialog(getDeleteTargets())"
            ><PbIcon :icon="PhTrash" /></button>
            <button class="sb-btn" id="sb-templates" :title="t('dash.templates')" :aria-label="t('dash.templates')" @click="openTemplates()"><PbIcon :icon="PhArchive" /></button>
            <button
              v-if="showViewSave"
              class="sb-btn view-save"
              id="sb-view-save"
              :title="t('dash.saveViewLayout')"
              :aria-label="t('dash.saveViewLayout')"
              @click="postToFrame({ type: 'pbgui_trigger_view_save' })"
            ><PbIcon :icon="PhFloppyDisk" /></button>
          </template>
        </div>
        <div id="sidebar-search-wrap" :class="{ visible: showSearch }">
          <span class="sb-search-icon" aria-hidden="true"><PbIcon :icon="PhMagnifyingGlass" /></span>
          <input
            id="sidebar-search"
            v-model="query"
            type="text"
            :placeholder="t('dash.filter')"
            autocomplete="off"
          >
        </div>
      </div>
      <DashboardList
        :dashboards="dashboards"
        :names="filteredNames"
        :current="currentDash"
        :selected="selected"
        :edit-mode="editMode"
        @select="selectSingleDashboard"
        @toggle="(name: string) => setDashboardSelected(name, !selected.includes(name))"
        @set-selected="setDashboardSelected"
        @edit="loadEditor(currentDash)"
      />
      <div id="sidebar-resize" :class="{ active: resizeActive }" @mousedown="onSidebarResizeDown"></div>
    </div>

    <!-- ── Main content ── -->
    <div id="main-content">
      <div id="content-loading" :style="{ display: frameLoading ? 'flex' : 'none' }">
        <div class="content-loading__visual" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <strong>{{ frameSrc ? t('common.loading') : t('dash.selectDashboard') }}</strong>
        <span class="content-loading__hint">{{ frameSrc ? currentDash : t('dash.dashboards') }}</span>
      </div>
      <iframe
        id="content-frame"
        ref="frameEl"
        :src="frameSrc"
        :class="{ visible: frameVisible }"
        :title="currentDash || t('dash.dashboards')"
        allowfullscreen
        @load="onFrameLoad"
      ></iframe>
    </div>
  </div>

  <NewDashboardDialog
    :visible="newDialogVisible"
    :existing-names="dashboards"
    @close="newDialogVisible = false"
    @create="createDashboard"
  />
  <DeleteDialog
    :visible="delDialogVisible"
    :names="delNames"
    @close="delDialogVisible = false"
    @confirm="confirmDelete"
  />
  <TemplatesOverlay :visible="tplVisible" :url="tplUrl" @close="closeTemplates" />
  </AppShell>
</template>

<!-- Layout scaffolding ported from frontend/dashboard_main.html (page-level,
     intentionally NOT scoped: pbgui_nav.js targets these ids/classes). The
     in-page #help-ovl / #about-ovl / #rename-dialog CSS was dropped with the
     dead markup (see the script mapping comment). Base styles and tokens come
     from @/styles/tailwind.css. -->
<style>
html,
body {
  overflow: hidden;
}

/* Dashboard library and active canvas share one restrained work surface. */
#page-body {
  display: flex;
  gap: 18px;
  padding: 18px 20px 22px;
  height: calc(100vh - 112px);
  height: calc(100dvh - 112px);
  overflow: hidden;
  user-select: none;
  background:
    radial-gradient(circle at 78% 2%, rgb(var(--accent-rgb) / 0.07), transparent 32rem),
    var(--bg-page);
}

.data-page-shell .app-shell__main {
  width: 100%;
  max-width: none;
  min-height: 0;
  padding: 0;
}

.data-page-shell .app-shell__primary {
  min-height: 0;
}

/* ── Left column: dashboard list as a content panel (not a second nav) ── */
#sidebar {
  width: 272px;
  min-width: 220px;
  max-width: 420px;
  flex-shrink: 0;
  background: rgb(var(--bg-panel-rgb) / 0.92);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-panel);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  user-select: none;
}
#sidebar-resize {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  background: transparent;
  transition: background var(--motion-fast) var(--ease-standard);
  z-index: 10;
}
#sidebar-resize:hover,
#sidebar-resize.active {
  background: linear-gradient(90deg, transparent 2px, rgb(var(--accent-rgb) / 0.62) 2px 4px, transparent 4px);
}

/* ── Panel header: title + count, tool strip, search ── */
/* Horizontal padding lives on the children so the edit-mode banner can run
   the full panel width as a header status strip. */
#sidebar-sticky {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, rgb(var(--accent-rgb) / 0.045), transparent 70%);
}
#sidebar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-md);
  padding: 18px 16px 12px;
}
.sb-heading {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.sb-title {
  color: var(--text-primary);
  font-size: var(--fs-lg);
  font-weight: 650;
  letter-spacing: var(--tracking-tight);
  line-height: 1.2;
}
.sb-subtitle {
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--fs-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-count {
  min-width: 28px;
  margin-top: 1px;
  font-size: var(--fs-xs);
  background: var(--accent-bg);
  border: 1px solid rgb(var(--accent-rgb) / 0.22);
  border-radius: var(--radius-md);
  padding: 3px 7px;
  color: var(--accent-soft);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
/* Panel operations are grouped in a compact command strip. */
#sidebar-toolbar {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  padding: 0 12px 12px;
}
.sb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 7px;
  border-radius: var(--radius-md);
  font-size: var(--fs-sm);
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  transition:
    transform var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.sb-btn:hover {
  background: var(--surface-elevated);
  border-color: var(--border-default);
  color: var(--text-primary);
}
.sb-btn:active {
  transform: translateY(1px) scale(0.98);
}
.sb-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.sb-btn--primary {
  gap: 5px;
  margin-right: auto;
  padding: 0 10px;
  background: var(--accent-deep);
  border-color: var(--accent-deep);
  color: #f2f5fb;
  font-weight: 600;
}
.sb-btn--primary:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}
.sb-btn-label {
  font-size: var(--fs-xs);
  white-space: nowrap;
}
.sb-btn.danger:hover {
  background: var(--danger-bg);
  border-color: rgb(var(--danger-rgb) / 0.35);
  color: var(--danger-soft);
}
.sb-btn.edit-mode-save {
  background: var(--success-bg);
  color: var(--success-soft);
  border-color: rgb(var(--success-rgb) / 0.35);
}
.sb-btn.edit-mode-save:hover {
  background: rgb(var(--success-rgb) / 0.2);
  border-color: var(--success-soft);
}
.sb-btn.view-save {
  background: var(--accent-bg);
  color: var(--accent-soft);
  border-color: rgb(var(--accent-rgb) / 0.35);
}
.sb-btn.view-save:hover {
  background: rgb(var(--accent-rgb) / 0.2);
  border-color: var(--accent-soft);
}

/* Edit-mode banner: a full-width status strip fused with the panel header. */
#edit-mode-banner {
  display: none;
  align-items: center;
  gap: var(--sp-xs);
  padding: 7px 16px;
  margin-bottom: 0;
  background: rgb(var(--accent-rgb) / 0.11);
  border-bottom: 1px solid rgb(var(--accent-rgb) / 0.2);
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--accent-soft);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}
#edit-mode-banner.visible {
  display: flex;
}
.em-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-soft);
  flex-shrink: 0;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

#sidebar-search-wrap {
  margin: 0 12px;
  padding-bottom: 12px;
  position: relative;
  display: none;
}
#sidebar-search-wrap.visible {
  display: block;
}
#sidebar-search {
  width: 100%;
  height: 34px;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 0 0.6rem 0 1.9rem;
  font-size: var(--fs-sm);
  outline: none;
}
#sidebar-search:focus {
  border-color: rgb(var(--accent-rgb) / 0.55);
  box-shadow: var(--focus-ring);
}
#sidebar-search::placeholder {
  color: var(--text-placeholder);
}
.sb-search-icon {
  position: absolute;
  left: 0.7rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: var(--fs-xs);
  pointer-events: none;
}

/* ── Dashboard list: compact library rows with explicit state ── */
#sidebar-list-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}
.sb-item-row {
  position: relative;
  margin-bottom: 3px;
}
.sb-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 40px;
  padding: 6px 8px;
  border-radius: var(--radius-lg);
  cursor: pointer;
  color: var(--text-secondary);
  border: 1px solid transparent;
  background: transparent;
  font-family: inherit;
  font-size: var(--fs-sm);
  text-align: left;
  transition:
    transform var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.sb-item:hover {
  background: rgb(var(--text-secondary-rgb) / 0.06);
  border-color: var(--border-subtle);
  color: var(--text-primary);
  transform: translateX(2px);
}
.sb-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.sb-item.active {
  padding-right: 40px;
  color: var(--text-primary);
  font-weight: 600;
}
.sb-item.selected {
  background: linear-gradient(90deg, rgb(var(--accent-rgb) / 0.17), rgb(var(--accent-rgb) / 0.07));
  border-color: rgb(var(--accent-rgb) / 0.28);
  color: var(--text-primary);
}
.sb-item.selected:hover {
  background: linear-gradient(90deg, rgb(var(--accent-rgb) / 0.21), rgb(var(--accent-rgb) / 0.1));
}
.sb-item-mark {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  background: var(--surface-elevated);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard);
}
.sb-item.active .sb-item-mark {
  border-color: var(--accent-soft);
  background: var(--accent);
  box-shadow: 0 0 0 3px rgb(var(--accent-rgb) / 0.12);
}
.sb-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-item-edit-icon {
  position: absolute;
  top: 7px;
  right: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--accent-soft);
  font-size: var(--fs-base);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard);
}
.sb-item-row:hover .sb-item-edit-icon,
.sb-item-row:focus-within .sb-item-edit-icon {
  opacity: 1;
}
.sb-item-edit-icon:hover {
  border-color: rgb(var(--accent-rgb) / 0.3);
  background: var(--accent-bg);
}
.sb-item-edit-icon:focus-visible {
  opacity: 1;
  outline: none;
  box-shadow: var(--focus-ring);
}
.sb-empty {
  color: var(--text-muted);
  padding: 48px 16px;
  text-align: center;
  font-size: var(--fs-sm);
  line-height: 1.6;
}
.sb-no-match {
  color: var(--text-muted);
  text-align: center;
  padding: 32px 12px;
  font-size: var(--fs-sm);
}

/* ── Main content area: the view iframe as the second content panel ── */
#main-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(rgb(var(--bg-panel-rgb) / 0.92), rgb(var(--bg-panel-rgb) / 0.92)),
    var(--surface-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-panel);
}
#content-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-primary);
  font-size: var(--fs-base);
  flex-direction: column;
  gap: 10px;
  background:
    radial-gradient(circle at 50% 42%, rgb(var(--accent-rgb) / 0.09), transparent 15rem),
    linear-gradient(135deg, transparent 0 49.5%, rgb(var(--text-secondary-rgb) / 0.025) 49.5% 50.5%, transparent 50.5% 100%);
  background-size: auto, 28px 28px;
}
.content-loading__visual {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  width: 58px;
  height: 48px;
  margin-bottom: 8px;
  padding: 7px;
  border: 1px solid rgb(var(--accent-rgb) / 0.28);
  border-radius: var(--radius-lg);
  background: rgb(var(--accent-rgb) / 0.08);
  box-shadow: 0 12px 32px rgb(var(--accent-rgb) / 0.08);
}
.content-loading__visual span {
  align-self: end;
  height: 55%;
  border-radius: 2px;
  background: var(--accent);
  animation: dashboard-skeleton 1.3s var(--ease-standard) infinite alternate;
}
.content-loading__visual span:nth-child(2) {
  height: 90%;
  animation-delay: 160ms;
}
.content-loading__visual span:nth-child(3) {
  height: 70%;
  animation-delay: 320ms;
}
.content-loading__hint {
  color: var(--text-muted);
  font-size: var(--fs-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}
@keyframes dashboard-skeleton {
  from { opacity: 0.35; transform: scaleY(0.72); }
  to { opacity: 1; transform: scaleY(1); }
}

#content-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: none;
  background: var(--bg-page);
}
#content-frame.visible {
  display: block;
}

/* ── New dashboard dialog ── (visibility via v-show inline display:none) */
#new-dash-dialog {
  display: flex;
  position: fixed;
  inset: 0;
  padding: 20px;
  background: var(--bg-backdrop);
  backdrop-filter: blur(8px);
  z-index: var(--z-modal);
  align-items: center;
  justify-content: center;
}
.dlg-box {
  background: var(--surface-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: 24px;
  width: min(420px, 100%);
  max-width: 95vw;
  box-shadow: var(--shadow-modal);
}
.dlg-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.dlg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border: 1px solid rgb(var(--accent-rgb) / 0.3);
  border-radius: var(--radius-lg);
  background: var(--accent-bg);
  color: var(--accent-soft);
  font-size: var(--fs-lg);
}
.dlg-icon--danger {
  border-color: rgb(var(--danger-rgb) / 0.3);
  background: var(--danger-bg);
  color: var(--danger-soft);
}
.dlg-title {
  font-size: var(--fs-lg);
  font-weight: 650;
  color: var(--text-primary);
  letter-spacing: var(--tracking-tight);
}
.dlg-field {
  margin-bottom: 14px;
}
.dlg-field label {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 7px;
}
.dlg-field input[type='text'] {
  width: 100%;
  height: var(--control-height-lg);
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 0 11px;
  font-size: var(--fs-base);
  outline: none;
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard);
}
.dlg-field input:focus {
  border-color: var(--accent-soft);
  box-shadow: var(--focus-ring);
}
.dlg-field input.err {
  border-color: var(--danger-soft);
  box-shadow: 0 0 0 3px rgb(var(--danger-rgb) / 0.16);
}
/* visibility via v-show (inline display:none) */
.dlg-err {
  color: var(--danger-soft);
  font-size: var(--fs-sm);
  margin-top: 0.35rem;
  display: block;
}
.dlg-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 22px;
}
.dlg-btn {
  min-height: 34px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid;
  transition:
    transform var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.dlg-btn.primary {
  background: var(--accent-deep);
  color: #f2f5fb;
  border-color: var(--accent-deep);
}
.dlg-btn.primary:hover {
  filter: brightness(1.14);
}
.dlg-btn.secondary {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border-default);
}
.dlg-btn.secondary:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}
.dlg-btn:active {
  transform: translateY(1px) scale(0.98);
}
.dlg-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* ── Delete confirm dialog ── (visibility via v-show inline display:none) */
#del-dash-dialog {
  display: flex;
  position: fixed;
  inset: 0;
  padding: 20px;
  background: var(--bg-backdrop);
  backdrop-filter: blur(8px);
  z-index: var(--z-modal);
  align-items: center;
  justify-content: center;
}
#del-confirm-text {
  color: var(--text-secondary);
  font-size: var(--fs-base);
  margin-bottom: 8px;
  line-height: 1.6;
}
#del-confirm-name {
  color: var(--text-primary);
  font-weight: 600;
}

/* ── Templates popup ── (visibility via v-show inline display:none) */
#tpl-overlay {
  display: flex;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: var(--z-toast);
  width: min(760px, 88vw);
  height: min(760px, 84vh);
  min-width: 360px;
  min-height: 300px;
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-modal);
  border: 1px solid var(--border-strong);
  background: var(--surface-elevated);
  flex-direction: column;
  resize: both;
}
#tpl-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 46px;
  cursor: move;
  z-index: 2;
}
#tpl-close-btn {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 10;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1;
  cursor: pointer;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: var(--radius-md);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
#tpl-close-btn:hover {
  border-color: var(--border-default);
  background: var(--bg-card);
  color: var(--text-primary);
}
#tpl-close-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
#tpl-iframe {
  width: 100%;
  height: 100%;
  border: none;
  flex: 1;
}

@media (max-width: 820px) {
  #page-body {
    gap: 12px;
    padding: 12px;
  }

  #sidebar {
    width: 220px;
    min-width: 190px;
  }

  .sb-btn-label,
  .sb-subtitle {
    display: none;
  }

  .sb-btn--primary {
    margin-right: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .em-dot,
  .content-loading__visual span {
    animation: none;
  }

  .sb-item:hover,
  .sb-btn:active,
  .dlg-btn:active {
    transform: none;
  }
}
</style>
