<script setup lang="ts">
/*
 * dashboard_templates migration — legacy function → component mapping
 * (source: frontend/dashboard_templates.html, kept as the legacy fallback)
 *
 * Behavior inventory: dashboard_templates is the template-manager POPUP for
 * dashboard_main — it is served inside dashboard_main's #tpl-overlay iframe
 * at /api/dashboard/templates_page?current=<name>&api_base=<origin>/api
 * (openTemplates in the already-migrated dashboard_main). It communicates
 * with the parent only OUTBOUND via postMessage:
 *   {type:'pbgui_close_templates'}     header ✕ button (permanently
 *                                      display:none — the parent overlay has
 *                                      its own close button — but the legacy
 *                                      handler was bound anyway, kept)
 *   {type:'pbgui_dashboard_created'}   after any successful creation
 * No inbound messages are handled, no editor iframes, no grid engine.
 *
 * ┌───────────────────────┬──────────────────────────────────────────────────┐
 * │ App (shell)           │ load templates + users in parallel (render only  │
 * │                       │ after BOTH settle; failures → empty lists),      │
 * │                       │ document.title, close/parent postMessage         │
 * │ SaveCard              │ Card 1: save current dashboard as template       │
 * │ ManageCard            │ Card 2: multi-select + rename/delete templates   │
 * │ CreateCard            │ Card 3: create dashboard(s) from template        │
 * │ MultiSelect           │ makeTplDropdown / makeUsersDropdown (shared      │
 * │                       │ widget: filter, click-toggle, drag paint-select, │
 * │                       │ ALL-row user semantics, keyboard toggle)         │
 * ├───────────────────────┴──────────────────────────────────────────────────┤
 * │ NOT PORTED (with justification):                                         │
 * │ - esc(): Vue interpolation escapes by construction; no v-html anywhere.  │
 * │ - apiGet/apiPost/apiDel raw-fetch helpers: replaced by the shared        │
 * │   apiFetch; legacy parsed JSON regardless of HTTP status, so non-ok      │
 * │   bodies flowed into the "no config / not ok" failure paths — apiFetch   │
 * │   throws instead, and every call site catches into the same message      │
 * │   (net effect identical for real backend responses).                     │
 * │ - i18n.js / pbgui_dialogs.js stay as shared legacy scripts loaded by     │
 * │   index.html (PBGuiDialogs.confirm drives the delete/overwrite dialogs). │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Deliberate deviations (documented):
 * - Legacy injected %%TOKEN%% as "" (cookie auth only); the shared apiFetch
 *   adds the boot Authorization header like the migrated dashboard_main.
 * - Legacy filtered multi-select items via style.display — kept (v-show).
 * - Legacy guarded window.parent.postMessage with `parent !== window` in one
 *   create branch only; a self-post is a no-op, so App posts unconditionally.
 * - The users-dropdown ALL defaulting lives in MultiSelect (legacy factory
 *   default); CreateCard passes ['ALL'] explicitly like the legacy page.
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import CreateCard from './components/CreateCard.vue';
import ManageCard from './components/ManageCard.vue';
import SaveCard from './components/SaveCard.vue';
import { initialCurrent, templatesUrl, usersUrl } from './config';
import type { OutboundMessage, TemplatesResponse, UsersResponse } from './types';

const { t } = useI18n();

/** Legacy %%CURRENT%%: the `current` query param of /api/dashboard/templates_page. */
const current = initialCurrent();

const templates = ref<string[]>([]);
const users = ref<string[]>([]);
const loaded = ref(false);

/* ── Init (legacy parallel loads + _checkLoaded render gate) ── */

async function loadTemplates(): Promise<void> {
  try {
    const data = await apiFetch<TemplatesResponse>(templatesUrl());
    templates.value = [...(data.templates ?? [])];
  } catch {
    templates.value = [];
  }
}

async function loadUsers(): Promise<void> {
  try {
    const data = await apiFetch<UsersResponse>(usersUrl());
    users.value = [...(data.users ?? [])];
  } catch {
    users.value = [];
  }
}

/* ── Card events (legacy page-level state mutations after render()) ── */

/** Legacy save success: append the name if missing, then sort. */
function onTemplateSaved(name: string): void {
  if (!templates.value.includes(name)) templates.value = [...templates.value, name].sort();
}

/** Legacy delete completion: filter the deleted names locally. */
function onTemplatesDeleted(names: string[]): void {
  templates.value = templates.value.filter((name) => !names.includes(name));
}

/** Legacy rename success: map old→new, then sort. */
function onTemplateRenamed(oldName: string, newName: string): void {
  templates.value = templates.value.map((name) => (name === oldName ? newName : name)).sort();
}

/* ── Parent protocol ── */

function postToParent(message: OutboundMessage): void {
  window.parent.postMessage(message, '*');
}

function onClose(): void {
  postToParent({ type: 'pbgui_close_templates' });
}

function onCreated(): void {
  postToParent({ type: 'pbgui_dashboard_created' });
}

onMounted(() => {
  document.title = t('dash.templatesTitle');
  // Legacy _checkLoaded: render only after BOTH parallel loads settle.
  void Promise.all([loadTemplates(), loadUsers()]).then(() => {
    loaded.value = true;
  });
});
</script>

<template>
  <MigrationWatermark />
  <div class="tpl-header">
    <div class="tpl-title"><span class="icon">📋</span> <span>{{ t('dash.dashboardTemplates') }}</span></div>
    <button
      id="btn-close"
      class="tpl-close"
      :title="t('common.close')"
      style="display:none"
      @click="onClose"
    >✕</button>
  </div>
  <div id="content" class="tpl-content">
    <div v-if="!loaded" style="color:#4a5568;padding:1rem">{{ t('dash.loading') }}</div>
    <template v-else>
      <SaveCard v-if="current" :current="current" @saved="onTemplateSaved" />
      <ManageCard :templates="templates" @deleted="onTemplatesDeleted" @renamed="onTemplateRenamed" />
      <CreateCard :templates="templates" :users="users" @created="onCreated" />
    </template>
  </div>
</template>

<!-- Page CSS ported verbatim from frontend/dashboard_templates.html
     (page-level, intentionally NOT scoped: the legacy ids/classes are the
     contract). The :root font-size block repeats tokens.css values exactly
     like the legacy page did; body rules override @/styles/base.css. -->
<style>
:root {
    --fs-xs: 11px;
    --fs-sm: 13px;
    --fs-base: 14px;
    --fs-md: 15px;
    --fs-lg: 18px;
    --fs-xl: 22px;
    --sp-xs: 4px;
    --sp-sm: 8px;
    --sp-md: 12px;
    --sp-lg: 20px;
    --input-h: 32px;
    --btn-h: 32px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif;
  font-size: var(--fs-base);
  background: #0e1117;
  color: #e2e8f0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ── Header bar ── */
.tpl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1a202c;
  border-bottom: 1px solid #2d3748;
  padding: 0.7rem 1rem;
  flex-shrink: 0;
  cursor: move;
  user-select: none;
}
.tpl-title {
  font-size: var(--fs-md);
  font-weight: 600;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.tpl-title span.icon { font-size: var(--fs-lg); }
.tpl-close {
  background: transparent;
  border: 1px solid #4a5568;
  border-radius: 4px;
  color: #94a3b8;
  cursor: pointer;
  font-size: var(--fs-md);
  padding: 0.25rem 0.6rem;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.tpl-close:hover { background: #2d3748; color: #e2e8f0; }

/* ── Content area ── */
.tpl-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Cards ── */
.tpl-card {
  background: #1a202c;
  border: 1px solid #2d3748;
  border-radius: 7px;
  padding: 0.85rem 1rem;
}
.tpl-card-title {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.65rem;
}

/* ── Input row ── */
.input-row {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}
.tpl-input {
  flex: 1;
  background: #2d3748;
  border: 1px solid #4a5568;
  border-radius: 5px;
  color: #e2e8f0;
  font-size: var(--fs-base);
  padding: 0.4rem 0.6rem;
  outline: none;
  min-width: 0;
}
.tpl-input:focus { border-color: #63b3ed; }
.tpl-select {
  width: 100%;
  background: #2d3748;
  border: 1px solid #4a5568;
  border-radius: 5px;
  color: #e2e8f0;
  font-size: var(--fs-base);
  padding: 0.4rem 0.6rem;
  outline: none;
  cursor: pointer;
  margin-bottom: 0.5rem;
}
.tpl-select:focus { border-color: #63b3ed; }

/* ── Buttons ── */
.btn {
  background: #2d3748;
  border: 1px solid #4a5568;
  border-radius: 5px;
  color: #e2e8f0;
  cursor: pointer;
  font-size: var(--fs-sm);
  padding: 0.4rem 0.75rem;
  white-space: nowrap;
  transition: background 0.15s;
}
.btn:hover { background: #3a4a5c; }
.btn.primary {
  background: #2b6cb0;
  border-color: #3182ce;
  color: #fff;
}
.btn.primary:hover { background: #3182ce; }
.btn.danger {
  background: #742a2a;
  border-color: #9b2c2c;
  color: #fed7d7;
}
.btn.danger:hover { background: #9b2c2c; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── Template list ── */
.tpl-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.tpl-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #2d3748;
  border: 1px solid #4a5568;
  border-radius: 5px;
  padding: 0.4rem 0.6rem;
  gap: 0.5rem;
}
.tpl-item-name {
  flex: 1;
  font-size: var(--fs-base);
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tpl-empty {
  color: #4a5568;
  font-size: var(--fs-sm);
  font-style: italic;
  padding: 0.4rem 0;
}

/* ── Bottom action row ── */
.action-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

/* ── Status messages ── */
.msg {
  font-size: var(--fs-sm);
  min-height: 1.1rem;
  margin-top: 0.35rem;
  padding: 0;
  border-radius: 4px;
  display: none;
}
.msg.ok { color: #68d391; display: block; }
.msg.err { color: #fc8181; display: block; }

/* ── Divider ── */
.tpl-label {
  font-size: var(--fs-sm);
  color: #718096;
  margin-bottom: 0.35rem;
}

/* ── Preview text ── */
.tpl-preview {
  font-size: var(--fs-sm);
  color: #718096;
  margin-top: 0.25rem;
  min-height: 1.1rem;
  font-style: italic;
}

/* ── Template manage row ── */
.tpl-mgmt-row {
  display: flex;
  gap: 0.4rem;
  align-items: stretch;
}
.tpl-mgmt-row .tpl-select { flex: 1; margin: 0; }
.tpl-mgmt-row .msel-wrap   { flex: 1; }

/* ── Multi-select dropdown ── */
.msel-wrap { position: relative; width: 100%; }
.msel-btn {
  background: #2d3748; color: #e2e8f0;
  border: 1px solid #4a5568; border-radius: 4px;
  padding: 0.38rem 0.6rem; font-size: var(--fs-base);
  cursor: pointer; width: 100%; text-align: left;
  display: flex; justify-content: space-between; align-items: center;
  white-space: nowrap; overflow: hidden;
}
.msel-btn:hover { border-color: #63b3ed; }
.msel-arrow { font-size: 0.55rem; margin-left: 0.4rem; flex-shrink: 0; }
.msel-drop {
  display: none; position: absolute; top: 100%; left: 0;
  background: #1a202c; border: 1px solid #4a5568; border-radius: 4px;
  min-width: 180px; max-height: 260px; overflow: hidden;
  z-index: 200; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  margin-top: 2px; width: 100%;
}
.msel-drop.open { display: block; }
.msel-filter {
  width: 100%; box-sizing: border-box;
  background: #2d3748; color: #e2e8f0;
  border: none; border-bottom: 1px solid #4a5568;
  padding: 0.35rem 0.5rem; font-size: var(--fs-sm); outline: none;
}
.msel-filter::placeholder { color: #64748b; }
.msel-list { max-height: 200px; overflow-y: auto; }
.msel-item {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.6rem; cursor: pointer; font-size: var(--fs-sm);
  color: #e2e8f0; white-space: nowrap;
}
.msel-item:hover { background: #2d3748; }
.msel-item.selected {
  background: rgba(77,166,255,.12);
  box-shadow: inset 3px 0 0 #63b3ed;
}
.msel-sep { border-top: 1px solid #2d3748; margin: 0.15rem 0; }
</style>
