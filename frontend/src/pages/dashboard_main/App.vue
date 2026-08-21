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
import { useI18n } from 'vue-i18n';
import { ApiError, apiFetch } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
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
  <MigrationWatermark />
  <nav id="topnav"></nav>
  <div id="page-body">
    <!-- ── Sidebar ── -->
    <div id="sidebar" ref="sidebarEl">
      <div id="sidebar-sticky">
        <div id="edit-mode-banner" :class="{ visible: editMode }">
          <span class="em-dot"></span><span>{{ t('dash.editMode') }}</span>
        </div>
        <div id="sidebar-header">
          <span class="sb-title">{{ t('dash.dashboards') }}</span>
          <span class="sb-count" id="sb-count">{{ countText }}</span>
        </div>
        <div id="sidebar-toolbar">
          <template v-if="editMode">
            <button
              class="sb-btn edit-mode-save"
              id="sb-save"
              :title="t('dash.saveDashboard')"
              @click="postToFrame({ type: 'pbgui_trigger_save' })"
            >💾</button>
            <button
              class="sb-btn"
              id="sb-cancel"
              :title="t('dash.cancelEdit')"
              @click="postToFrame({ type: 'pbgui_trigger_cancel' })"
            >✕</button>
            <button
              class="sb-btn danger"
              id="sb-delete"
              :title="t('dash.deleteDashboard')"
              @click="openDeleteDialog(currentDash ? [currentDash] : [])"
            >🗑</button>
          </template>
          <template v-else>
            <button class="sb-btn" id="sb-refresh" :title="t('dash.refreshList')" @click="refreshList()">↻</button>
            <button class="sb-btn" id="sb-new" :title="t('dash.newDashboard')" @click="newDialogVisible = true">➕</button>
            <button
              v-if="currentDash"
              class="sb-btn"
              id="sb-edit"
              :title="t('dash.editCurrentDashboard')"
              @click="loadEditor(currentDash)"
            >✎</button>
            <button
              v-if="getDeleteTargets().length"
              class="sb-btn danger"
              id="sb-del"
              :title="getDeleteTargets().length > 1 ? t('dash.deleteSelectedDashboards') : t('dash.deleteSelectedDashboard')"
              @click="openDeleteDialog(getDeleteTargets())"
            >🗑</button>
            <button class="sb-btn" id="sb-templates" :title="t('dash.templates')" @click="openTemplates()">🗃</button>
            <button
              v-if="showViewSave"
              class="sb-btn view-save"
              id="sb-view-save"
              :title="t('dash.saveViewLayout')"
              @click="postToFrame({ type: 'pbgui_trigger_view_save' })"
            >💾</button>
          </template>
        </div>
        <div id="sidebar-search-wrap" :class="{ visible: showSearch }">
          <span class="sb-search-icon">🔍</span>
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
        <div class="spinner"></div>
        <span>{{ t('dash.selectDashboard') }}</span>
      </div>
      <iframe
        id="content-frame"
        ref="frameEl"
        :src="frameSrc"
        :class="{ visible: frameVisible }"
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
</template>

<!-- Layout scaffolding ported from frontend/dashboard_main.html (page-level,
     intentionally NOT scoped: pbgui_nav.js targets these ids/classes). The
     in-page #help-ovl / #about-ovl / #rename-dialog CSS was dropped with the
     dead markup (see the script mapping comment). Base styles and tokens come
     from @/styles/tokens.css + base.css. -->
<style>
html,
body {
  overflow: hidden;
}

#page-body {
  display: flex;
  height: calc(100vh - 52px); /* topnav height, injected by pbgui_nav.js */
  height: calc(100dvh - 52px);
  overflow: hidden;
  user-select: none;
  background: var(--bg-page);
}

/* ── Left sidebar ── */
#sidebar {
  width: 240px;
  min-width: 180px;
  max-width: 340px;
  flex-shrink: 0;
  background: var(--bg-page);
  border-right: 1px solid var(--border-subtle);
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
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  z-index: 10;
}
#sidebar-resize:hover,
#sidebar-resize.active {
  background: rgba(99, 179, 237, 0.4);
}

/* ── Sidebar sticky top: toolbar + search ── */
#sidebar-sticky {
  flex-shrink: 0;
  padding: 0.5rem 0.5rem 0;
}
#sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.3rem 0.25rem 0.4rem;
}
.sb-title {
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--text-dim);
  font-weight: 700;
}
.sb-count {
  font-size: var(--fs-xs);
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 0.05rem 0.4rem;
  color: var(--text-muted);
  font-weight: 600;
}
#sidebar-toolbar {
  display: flex;
  gap: 0.3rem;
  padding: 0 0.1rem 0.45rem;
  border-bottom: 1px solid var(--border-subtle);
  flex-wrap: wrap;
}
.sb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem 0.55rem;
  border-radius: 6px;
  font-size: var(--fs-sm);
  cursor: pointer;
  border: 1px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-secondary);
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.sb-btn:hover {
  background: #252d3d; /* hover state between bg-card and bg-elevated */
  color: var(--text-primary);
  border-color: var(--text-dim);
}
.sb-btn.danger:hover {
  background: var(--danger-bg);
  border-color: rgba(255, 75, 75, 0.35);
  color: var(--danger-soft);
}
.sb-btn.edit-mode-save {
  background: rgba(33, 195, 84, 0.08);
  color: var(--success-soft);
  border-color: rgba(33, 195, 84, 0.35);
}
.sb-btn.edit-mode-save:hover {
  background: rgba(33, 195, 84, 0.18);
  border-color: var(--success-soft);
}
.sb-btn.view-save {
  background: rgba(77, 166, 255, 0.08);
  color: var(--accent-soft);
  border-color: rgba(77, 166, 255, 0.35);
}
.sb-btn.view-save:hover {
  background: rgba(77, 166, 255, 0.18);
  border-color: var(--accent-soft);
}

#edit-mode-banner {
  display: none;
  align-items: center;
  gap: 0.4rem;
  background: rgba(77, 166, 255, 0.07);
  border-left: 3px solid var(--accent-soft);
  border-radius: 0 6px 6px 0;
  padding: 0.35rem 0.6rem;
  margin-bottom: 0.4rem;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--accent-soft);
  letter-spacing: 0.04em;
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
  padding: 0.35rem 0.1rem 0.35rem;
  position: relative;
  display: none;
}
#sidebar-search-wrap.visible {
  display: block;
}
#sidebar-search {
  width: 100%;
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 0.3rem 0.5rem 0.3rem 1.6rem;
  font-size: var(--fs-sm);
  outline: none;
}
#sidebar-search:focus {
  border-color: var(--text-dim);
}
#sidebar-search::placeholder {
  color: var(--text-dim);
}
.sb-search-icon {
  position: absolute;
  left: 0.55rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim);
  font-size: var(--fs-xs);
  pointer-events: none;
}

/* ── Sidebar dashboard list ── */
#sidebar-list-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0.35rem;
}
.sb-item {
  display: flex;
  align-items: center;
  padding: 0.4rem 0.6rem 0.4rem 0.7rem;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  border-left: 2px solid transparent;
  border-right: 1px solid transparent;
  border-top: 1px solid transparent;
  border-bottom: 1px solid transparent;
  font-size: var(--fs-sm);
  margin-bottom: 1px;
  transition: background 0.1s, color 0.1s;
}
.sb-item:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}
.sb-item.active {
  color: var(--text-primary);
  font-weight: 600;
}
.sb-item.selected {
  background: rgba(77, 166, 255, 0.12);
  border-left: 3px solid var(--accent-soft);
  border-radius: 0 6px 6px 0;
  padding-left: calc(0.7rem - 1px);
}
.sb-item.selected:hover {
  background: rgba(77, 166, 255, 0.16);
}
.sb-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-item-edit-icon {
  display: none;
  color: var(--accent-soft);
  font-size: var(--fs-base);
  padding: 0.1rem 0.15rem;
  opacity: 0.6;
  flex-shrink: 0;
}
.sb-item.active:hover .sb-item-edit-icon {
  display: inline;
}
.sb-item-edit-icon:hover {
  opacity: 1;
}
.sb-empty {
  color: var(--text-dim);
  font-style: italic;
  padding: 1rem 0.6rem;
  text-align: center;
  font-size: var(--fs-sm);
}
.sb-no-match {
  color: var(--text-dim);
  text-align: center;
  padding: 0.6rem;
  font-size: var(--fs-sm);
}

/* ── Main content area ── */
#main-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}
#content-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-dim);
  font-size: var(--fs-base);
  flex-direction: column;
  gap: 0.75rem;
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-default);
  border-top-color: var(--accent-soft);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

#content-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: none;
}
#content-frame.visible {
  display: block;
}

/* ── New dashboard dialog ── (visibility via v-show inline display:none) */
#new-dash-dialog {
  display: flex;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}
.dlg-box {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 1.5rem;
  width: 360px;
  max-width: 95vw;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.7);
}
.dlg-title {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 1rem;
}
.dlg-field {
  margin-bottom: 0.75rem;
}
.dlg-field label {
  display: block;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-secondary);
  margin-bottom: 0.3rem;
}
.dlg-field input[type='text'] {
  width: 100%;
  background: var(--border-default);
  color: var(--text-primary);
  border: 1px solid var(--text-dim);
  border-radius: 5px;
  padding: 0.4rem 0.6rem;
  font-size: var(--fs-base);
  outline: none;
}
.dlg-field input:focus {
  border-color: var(--accent-soft);
}
.dlg-field input.err {
  border-color: var(--danger-soft);
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
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
}
.dlg-btn {
  padding: 0.35rem 1rem;
  border-radius: 6px;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid;
}
.dlg-btn.primary {
  background: var(--success-bg);
  color: var(--success-soft);
  border-color: rgba(33, 195, 84, 0.4);
}
.dlg-btn.primary:hover {
  background: rgba(33, 195, 84, 0.2);
  border-color: var(--success-soft);
}
.dlg-btn.secondary {
  background: var(--border-default);
  color: var(--text-secondary);
  border-color: var(--text-dim);
}
.dlg-btn.secondary:hover {
  background: var(--border-strong);
  color: var(--text-primary);
}

/* ── Delete confirm dialog ── (visibility via v-show inline display:none) */
#del-dash-dialog {
  display: flex;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}
#del-confirm-text {
  color: var(--text-secondary);
  font-size: var(--fs-base);
  margin-bottom: 1rem;
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
  z-index: 2000;
  width: 700px;
  height: 740px;
  min-width: 360px;
  min-height: 300px;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.85);
  border: 1px solid var(--border-strong);
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
  top: 6px;
  right: 8px;
  z-index: 10;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}
#tpl-close-btn:hover {
  color: var(--text-primary);
}
#tpl-iframe {
  width: 100%;
  height: 100%;
  border: none;
  flex: 1;
}
</style>
