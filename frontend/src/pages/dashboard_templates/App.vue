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
 * Shell boundary (intentional): AppShell and StatusStrip are not rendered
 * because this page is the dashboard_main templates iframe. The parent owns
 * the rail and overlay chrome; adding another shell here would break the
 * iframe's compact layout and its postMessage handoff.
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
import { PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
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
      :aria-label="t('common.close')"
      style="display:none"
      @click="onClose"
    ><PbIcon :icon="PhX" /></button>
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
/* Layout scaffolding ported from frontend/dashboard_templates.html.
   Tokens, reset, and base styles come from @/styles/tokens.css + base.css. */

body {
  background: var(--bg-page);
  color: var(--text-primary);
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

/* ── Header bar ── */
.tpl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-default);
  padding: 0.7rem 1rem;
  flex-shrink: 0;
  cursor: move;
  user-select: none;
}
.tpl-title {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.tpl-title span.icon { font-size: var(--fs-lg); }
.tpl-close {
  background: transparent;
  border: 1px solid var(--text-dim);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--fs-md);
  padding: 0.25rem 0.6rem;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.tpl-close:hover { background: var(--border-default); color: var(--text-primary); }

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
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 7px;
  padding: 0.85rem 1rem;
}
.tpl-card-title {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-secondary);
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
  background: var(--border-default);
  border: 1px solid var(--text-dim);
  border-radius: 5px;
  color: var(--text-primary);
  font-size: var(--fs-base);
  padding: 0.4rem 0.6rem;
  outline: none;
  min-width: 0;
}
.tpl-input:focus { border-color: var(--accent-soft); }
.tpl-select {
  width: 100%;
  background: var(--border-default);
  border: 1px solid var(--text-dim);
  border-radius: 5px;
  color: var(--text-primary);
  font-size: var(--fs-base);
  padding: 0.4rem 0.6rem;
  outline: none;
  cursor: pointer;
  margin-bottom: 0.5rem;
}
.tpl-select:focus { border-color: var(--accent-soft); }

/* ── Buttons ── */
.btn {
  background: var(--border-default);
  border: 1px solid var(--text-dim);
  border-radius: 5px;
  color: var(--text-primary);
  cursor: pointer;
  font-size: var(--fs-sm);
  padding: 0.4rem 0.75rem;
  white-space: nowrap;
  transition: background 0.15s;
}
.btn:hover { background: var(--border-strong); }
.btn.primary {
  background: var(--info);
  border-color: var(--accent);
  color: #fff; /* white on colored bg */
}
.btn.primary:hover { background: var(--accent); }
.btn.danger {
  background: var(--danger-bg);
  border-color: var(--danger);
  color: var(--danger-soft);
}
.btn.danger:hover { background: var(--danger); }
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
  background: var(--border-default);
  border: 1px solid var(--text-dim);
  border-radius: 5px;
  padding: 0.4rem 0.6rem;
  gap: 0.5rem;
}
.tpl-item-name {
  flex: 1;
  font-size: var(--fs-base);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tpl-empty {
  color: var(--text-dim);
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
.msg.ok { color: var(--success-soft); display: block; }
.msg.err { color: var(--danger-soft); display: block; }

/* ── Divider ── */
.tpl-label {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  margin-bottom: 0.35rem;
}

/* ── Preview text ── */
.tpl-preview {
  font-size: var(--fs-sm);
  color: var(--text-muted);
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
  background: var(--border-default); color: var(--text-primary);
  border: 1px solid var(--text-dim); border-radius: 4px;
  padding: 0.38rem 0.6rem; font-size: var(--fs-base);
  cursor: pointer; width: 100%; text-align: left;
  display: flex; justify-content: space-between; align-items: center;
  white-space: nowrap; overflow: hidden;
}
.msel-btn:hover { border-color: var(--accent-soft); }
.msel-arrow { font-size: 0.55rem; margin-left: 0.4rem; flex-shrink: 0; }
.msel-drop {
  display: none; position: absolute; top: 100%; left: 0;
  background: var(--bg-card); border: 1px solid var(--text-dim); border-radius: 4px;
  min-width: 180px; max-height: 260px; overflow: hidden;
  z-index: 200; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  margin-top: 2px; width: 100%;
}
.msel-drop.open { display: block; }
.msel-filter {
  width: 100%; box-sizing: border-box;
  background: var(--border-default); color: var(--text-primary);
  border: none; border-bottom: 1px solid var(--text-dim);
  padding: 0.35rem 0.5rem; font-size: var(--fs-sm); outline: none;
}
.msel-filter::placeholder { color: var(--text-muted); }
.msel-list { max-height: 200px; overflow-y: auto; }
.msel-item {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.6rem; cursor: pointer; font-size: var(--fs-sm);
  color: var(--text-primary); white-space: nowrap;
}
.msel-item:hover { background: var(--border-default); }
.msel-item.selected {
  background: rgba(77,166,255,.12);
  box-shadow: inset 3px 0 0 #63b3ed;
}
.msel-sep { border-top: 1px solid var(--border-default); margin: 0.15rem 0; }
</style>
