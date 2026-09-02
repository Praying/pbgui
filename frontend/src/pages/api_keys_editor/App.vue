<script setup lang="ts">
/*
 * API Keys editor — the Vue port of frontend/api_keys_editor.html
 * (3,783 lines; legacy line refs below are provenance):
 *
 * ┌────────────────────────────┬─ Legacy regions ───────────────────────────┐
 * │ App (this shell)           │ markup :607-1076, init :1160-1214,         │
 * │                            │ backToList :1789-1819, sidebar resize      │
 * │                            │ :3466-3486, expiry refresh :1711-1769/     │
 * │                            │ :2051-2109, help opener :3760-3766         │
 * │ UserListTable              │ meta bar :676-707, renderUserTable         │
 * │                            │ :1309-1427, sort/filter/keys :1429-1473    │
 * │ EditUserPanel              │ :709-827 markup; edit/save/delete/test/     │
 * │                            │ reveal :1493-2259                          │
 * │ HlExpiryPanel /            │ :829-847 / :849-867 markup; render         │
 * │ BybitExpiryPanel           │ :2087-2109 / :1745-1769                    │
 * │ CommentsPanel              │ :869-900, :2326-2429                       │
 * │ HlConfigPanel              │ :902-919, :2431-2497                       │
 * │ TradfiPanel + useTradfi    │ :921-1016, :2499-3089                      │
 * │ BackupsPanel + DiffModal   │ :1018-1031, :3091-3246, :3270-3420         │
 * │ LogPanel                   │ :1033-1039, :3422-3464 (LogViewerPanel     │
 * │                            │ global kept)                               │
 * │ AlertModal + useToasts     │ :2270-2324                                 │
 * │ lib/pageApi                │ apiFetch :1216-1240                        │
 * │ lib/{expiry,masked,        │ :1475-1491/:2118-2165/:3309-3420           │
 * │  diffRows}                 │                                            │
 * │ config.ts                  │ %% injections :1087-1095 via boot.js       │
 * └────────────────────────────┴────────────────────────────────────────────┘
 *
 * Deliberate deviations (documented in .superpowers/sdd/apikeys-report.md):
 *  - The dead embedded help overlay (:612-642 markup, :3488-3766 logic) is
 *    dropped: it was never openable; the nav Guide button goes through
 *    PBGuiSharedHelp, which this page wires as window.PBGUI_HELP_OPENER.
 *  - HTML-string builders became Vue interpolation (no v-html except the
 *    three legacy data-i18n-html paragraphs, whose static dictionary
 *    strings contain markup by design).
 *  - No polling existed in legacy (verified) — none ported.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { PhArchive, PhClipboardText, PhPlus } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { useAiPageContext } from '@/shared/ai/context';
import AppShell from '@/shared/components/AppShell.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import { Button } from '@/shared/components/ui/button';
import type { PageSection } from '@/shared/navigation';
import AlertModal from './components/AlertModal.vue';
import BackupsPanel from './components/BackupsPanel.vue';
import BybitExpiryPanel from './components/BybitExpiryPanel.vue';
import CommentsPanel from './components/CommentsPanel.vue';
import EditUserPanel from './components/EditUserPanel.vue';
import HlConfigPanel from './components/HlConfigPanel.vue';
import HlExpiryPanel from './components/HlExpiryPanel.vue';
import LogPanel from './components/LogPanel.vue';
import TradfiPanel from './components/TradfiPanel.vue';
import UserListTable from './components/UserListTable.vue';
import { pageFetch, onUnauthorized } from './lib/pageApi';
import { confirmDialog } from './lib/dialogs';
import { provideToasts, useToasts } from './composables/useToasts';
import { useApiKeysStore } from './composables/useApiKeysStore';
import { useTradfi } from './composables/useTradfi';
import type { BybitExpiryInfo, HlExpiryInfo } from './types';

const { t } = useI18n();

type View = 'list' | 'edit' | 'hlExpiry' | 'bybitExpiry' | 'comments' | 'hlConfig' | 'tradfi' | 'backups' | 'logs';

const view = ref<View>('list');

/* Page sections live in the workbench rail (accordion under this page's
   entry) — the legacy in-page sidebar column is retired. The expiry
   entries keep their legacy action semantics: selecting one runs the
   check (fetch) and lands on its results view. */
const SECTION_VIEWS: ReadonlyArray<{ view: View; labelKey: string; hash: string | null }> = [
  { view: 'list', labelKey: 'misc.apikeys.users', hash: null },
  { view: 'hlExpiry', labelKey: 'misc.apikeys.hlExpiryCheck', hash: null },
  { view: 'bybitExpiry', labelKey: 'misc.apikeys.bybitExpiryCheck', hash: null },
  { view: 'hlConfig', labelKey: 'misc.apikeys.hlWarningConfig', hash: '#hl-config' },
  { view: 'tradfi', labelKey: 'misc.apikeys.tradfi', hash: '#tradfi' },
  { view: 'comments', labelKey: 'misc.apikeys.comments', hash: '#comments' },
  { view: 'backups', labelKey: 'misc.apikeys.backups', hash: '#backups' },
  { view: 'logs', labelKey: 'misc.apikeys.logs', hash: null },
];

const activeSection = computed<string>(() => (view.value === 'edit' ? 'list' : view.value));

/* AI drawer page context — Vue port of the legacy credential-management
   registration (editing user becomes a pbgui_user entity). */
useAiPageContext({
  id: 'api-keys',
  getContext: () => ({
    section: 'Credential management',
    entities: view.value === 'edit' && editRef.value?.editingName
      ? [{ kind: 'pbgui_user', name: String(editRef.value.editingName) }]
      : [],
  }),
});

const sections = computed<PageSection[]>(() =>
  SECTION_VIEWS.map((entry) => ({ key: entry.view, label: t(entry.labelKey) })),
);

function onSectionSelect(sectionKey: string): void {
  const target = sectionKey as View;
  if (target === 'list') {
    void backToList();
    return;
  }
  if (target === 'hlExpiry') {
    void refreshHLExpiry();
    return;
  }
  if (target === 'bybitExpiry') {
    void refreshBybitExpiry();
    return;
  }
  if (view.value === target) {
    void backToList();
    return;
  }
  const entry = SECTION_VIEWS.find((entry) => entry.view === target);
  setPanelView(target as Exclude<View, 'list' | 'edit'>, entry?.hash ?? null);
}

const hlPanelData = ref<HlExpiryInfo[]>([]);
const bybitPanelData = ref<BybitExpiryInfo[]>([]);
const hlChecking = ref(false);
const bybitChecking = ref(false);

const toasts = useToasts((key, params) => t(key, params ?? {}));
provideToasts(toasts);

const store = useApiKeysStore((key, params) => t(key, params ?? {}), toasts);
const tradfiStore = useTradfi((key, params) => t(key, params ?? {}), toasts);

const editRef = ref<InstanceType<typeof EditUserPanel> | null>(null);

/* ── help opener for the nav Guide button (:3760-3766) ── */

function wireHelpOpener(): void {
  (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER = () => {
    window.location.href = '/api/help/main_page?topic=20_api_keys';
  };
}

/* ── panel navigation (:1789-1819) ── */

async function backToList(): Promise<void> {
  if (view.value === 'edit' && editRef.value?.formDirty) {
    if (
      !(await confirmDialog({
        title: t('misc.apikeys.discardChangesTitle'),
        message: t('misc.apikeys.discardChangesMessage'),
        confirmText: t('misc.apikeys.leave'),
      }))
    )
      return;
  }
  editRef.value?.clearRevealedApiKey();
  tradfiStore.clearRevealedApiKey();
  if (editRef.value) editRef.value.formDirty = false;
  view.value = 'list';
  history.replaceState(null, '', location.pathname + location.search);
  focusFilter();
}

function setPanelView(next: Exclude<View, 'list' | 'edit'>, hash: string | null): void {
  editRef.value?.clearRevealedApiKey();
  tradfiStore.clearRevealedApiKey();
  view.value = next;
  if (hash !== null) location.hash = hash;
}

/* ── user actions ── */

async function onEditUser(name: string): Promise<void> {
  const opened = await editRef.value?.openEdit(name);
  if (opened) view.value = 'edit';
}

function onDeleteUser(name: string): void {
  void editRef.value?.confirmDelete(name);
}

function showCreateForm(): void {
  editRef.value?.openCreate();
  view.value = 'edit';
}

/* ── expiry checks (:1711-1769, :2051-2109) ── */

async function refreshHLExpiry(): Promise<void> {
  hlChecking.value = true;
  try {
    const data = await pageFetch<HlExpiryInfo[]>('/hl-expiry?force=true');
    const map: Record<string, HlExpiryInfo> = {};
    for (const item of data) map[item.name] = item;
    store.replaceHlExpiry(map);
    hlPanelData.value = data;
    view.value = 'hlExpiry';
    toasts.showToast(t('misc.apikeys.hlExpiryDataRefreshed'), 'success');
  } catch (e) {
    toasts.showToast(t('misc.apikeys.hlExpiryCheckFailed', { error: e instanceof Error ? e.message : '' }), 'error');
  } finally {
    hlChecking.value = false;
  }
}

async function refreshBybitExpiry(): Promise<void> {
  bybitChecking.value = true;
  try {
    const data = await pageFetch<BybitExpiryInfo[]>('/bybit-expiry?force=true');
    const map: Record<string, BybitExpiryInfo> = {};
    for (const item of data) map[item.name] = item;
    store.replaceBybitExpiry(map);
    bybitPanelData.value = data;
    view.value = 'bybitExpiry';
    toasts.showToast(t('misc.apikeys.bybitExpiryDataRefreshed'), 'success');
  } catch (e) {
    toasts.showToast(t('misc.apikeys.bybitExpiryCheckFailed', { error: e instanceof Error ? e.message : '' }), 'error');
  } finally {
    bybitChecking.value = false;
  }
}

let filterFocusTimer: ReturnType<typeof setTimeout> | null = null;
function focusFilter(): void {
  if (filterFocusTimer) clearTimeout(filterFocusTimer);
  filterFocusTimer = setTimeout(() => {
    if (typeof document !== 'undefined') {
      document.getElementById('userFilter')?.focus();
    }
  }, 50);
}

/* ── Escape closes any open panel (:1167-1177) ── */

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && view.value !== 'list') void backToList();
}

/* ── pagehide secret hygiene (:1214, :2253-2259) ── */

function onPageHide(): void {
  editRef.value?.clearSecretInputs();
  tradfiStore.clearRevealedApiKey();
}

let removeUnauthorizedListener: (() => void) | null = null;

onBeforeUnmount(() => {
  if (filterFocusTimer) clearTimeout(filterFocusTimer);
  document.removeEventListener('keydown', onDocumentKeydown);
  window.removeEventListener('pagehide', onPageHide);
  if (removeUnauthorizedListener) removeUnauthorizedListener();
  removeUnauthorizedListener = null;
  editRef.value?.clearSecretInputs();
  tradfiStore.clearRevealedApiKey();
  delete (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
});

/* ── init (:1160-1213) ── */

onMounted(async () => {
  document.title = t('misc.apikeys.title');
  wireHelpOpener();
  document.addEventListener('keydown', onDocumentKeydown);
  window.addEventListener('pagehide', onPageHide);
  removeUnauthorizedListener = onUnauthorized(() => {
    tradfiStore.clearRevealedApiKey();
    editRef.value?.clearRevealedApiKey();
  });

  await store.loadExchanges();
  store.restoreUrlParams();

  const hash = window.location.hash;
  const hashEdit = hash.startsWith('#edit/') ? decodeURIComponent(hash.slice(6)) : null;
  if (hashEdit) {
    await nextTick();
    view.value = 'edit';
    await Promise.all([store.loadUsers(), onEditUser(hashEdit)]);
  } else if (hash === '#tradfi') {
    view.value = 'tradfi';
    await store.loadUsers();
  } else if (hash === '#backups') {
    view.value = 'backups';
    await store.loadUsers();
  } else if (hash === '#comments') {
    view.value = 'comments';
    await store.loadUsers();
  } else if (hash === '#hl-config') {
    view.value = 'hlConfig';
    await store.loadUsers();
  } else {
    await store.loadUsers();
    focusFilter();
  }
});
</script>

<template>
  <AppShell
    class="data-page-shell data-page-shell--api-keys"
    page-key="system_api_keys"
    :page-title="t('misc.apikeys.title')"
    :sections="sections"
    :active-section="activeSection"
    @update:section="onSectionSelect"
  >
    <MigrationWatermark />
    <template v-if="store.usersState.value === 'loading' || store.usersState.value === 'error'" #status>
      <StatusStrip
        :label="t('shared.status')"
        :value="store.usersState.value === 'loading' ? t('common.loading') : t('common.error')"
        :tone="store.usersState.value === 'loading' ? 'warning' : 'danger'"
      />
    </template>

    <div id="page-body" class="flex h-[calc(100dvh-64px)] min-h-0 gap-[var(--component-gap)] overflow-hidden select-none">
      <div id="main-content" class="min-h-0 min-w-0 flex-1 select-text overflow-y-auto p-[var(--page-padding)]">
        <!-- User list -->
        <UserListTable v-show="view === 'list'" :store="store" @edit="onEditUser" @delete="onDeleteUser" @create="showCreateForm" />

        <!-- Edit/Create panel -->
        <EditUserPanel
          ref="editRef"
          v-show="view === 'edit'"
          :store="store"
          @back="backToList"
          @users-changed="() => {}"
        />

        <!-- HL Expiry Panel -->
        <HlExpiryPanel v-if="view === 'hlExpiry'" :data="hlPanelData" @back="backToList" />

        <!-- Bybit Expiry Panel -->
        <BybitExpiryPanel v-if="view === 'bybitExpiry'" :data="bybitPanelData" @back="backToList" />

        <!-- Comments -->
        <CommentsPanel v-if="view === 'comments'" @back="backToList" />

        <!-- HL Expiry Warning Config -->
        <HlConfigPanel v-if="view === 'hlConfig'" @back="backToList" />

        <!-- TradFi -->
        <TradfiPanel v-if="view === 'tradfi'" :store="tradfiStore" @back="backToList" />

        <!-- Backups -->
        <BackupsPanel v-if="view === 'backups'" @back="backToList" @restored="store.loadUsers()" />

        <!-- Logs -->
        <LogPanel :visible="view === 'logs'" @back="backToList" />
      </div>
    </div>

    <AlertModal />
  </AppShell>
</template>

<style>
/* Root overflow rule ported from styles/api_keys_editor.css (html/body carry
   no scope attribute — unscoped block). */
body {
  overflow: hidden;
}

/* Panel fade-in + shared expiry-table row rules, also ported from
   styles/api_keys_editor.css. They target elements rendered by several child
   components, so they live in this unscoped block; 'edit-panel',
   'hl-expiry-panel' and 'hl-expiry-table' remain as inert anchors. */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.edit-panel,
.hl-expiry-panel {
  animation: fadeIn 0.18s ease;
}

.hl-expiry-table tbody tr:hover td {
  background: rgb(var(--text-secondary-rgb) / 0.05);
}

.hl-expiry-table tbody tr:last-child td {
  border-bottom: none;
}

/* PBGuiDialogs injects its reusable DOM at document.body level. These
   higher-specificity overrides keep this page's confirmations on the same
   Precision Terminal surface, border, type, and control tokens as the Vue
   credential editor without changing dialogs on unrelated pages. */
body #pbgui-dialog-ovl {
  padding: var(--spacing-lg);
  background: var(--color-backdrop);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

body #pbgui-dialog-box {
  width: min(460px, 100%);
  border: 1px solid rgb(var(--text-secondary-rgb) / 0.18);
  border-radius: var(--radius-xl);
  background:
    radial-gradient(circle at 100% 0%, rgb(var(--accent-rgb) / 0.08), transparent 20rem),
    linear-gradient(145deg, rgb(var(--bg-panel-rgb) / 0.99), rgb(var(--bg-page-rgb) / 0.99));
  box-shadow: var(--shadow-modal), inset 0 1px 0 rgb(255 255 255 / 0.07);
}

body #pbgui-dialog-header {
  min-height: 54px;
  padding: 12px 16px;
  border-bottom: 1px solid rgb(var(--text-secondary-rgb) / 0.13);
  background: rgb(var(--bg-page-rgb) / 0.5);
}

body #pbgui-dialog-title {
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-section);
  font-weight: 650;
  letter-spacing: -0.015em;
}

body #pbgui-dialog-close {
  display: inline-grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  transition: background-color 120ms var(--ease-standard), border-color 120ms var(--ease-standard), color 120ms var(--ease-standard);
}

body #pbgui-dialog-close:hover {
  border-color: rgb(var(--text-secondary-rgb) / 0.16);
  background: rgb(var(--text-secondary-rgb) / 0.08);
  color: var(--text-primary);
}

body #pbgui-dialog-close:focus-visible,
body .pbgui-dialog-btn:focus-visible {
  outline: 2px solid rgb(var(--accent-rgb) / 0.72);
  outline-offset: 2px;
}

body #pbgui-dialog-body {
  gap: 18px;
  padding: 20px;
}

body #pbgui-dialog-message {
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: var(--text-body);
  line-height: 1.6;
}

body #pbgui-dialog-detail {
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-caption);
}

body #pbgui-dialog-actions {
  gap: 8px;
  padding-top: 2px;
}

body .pbgui-dialog-btn {
  height: var(--control-height-md);
  padding: 0 12px;
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: var(--text-small);
  font-weight: 600;
  transition: background-color 120ms var(--ease-standard), border-color 120ms var(--ease-standard), color 120ms var(--ease-standard), transform 120ms var(--ease-standard);
}

body .pbgui-dialog-btn:active {
  transform: scale(0.985);
}

body .pbgui-dialog-btn.secondary {
  border-color: var(--border-default);
  background: var(--bg-elevated);
  color: var(--text-primary);
}

body .pbgui-dialog-btn.secondary:hover {
  border-color: var(--border-strong);
  background: var(--border-default);
}

body .pbgui-dialog-btn.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  box-shadow: 0 2px 10px rgb(var(--accent-rgb) / 0.2);
}

body .pbgui-dialog-btn.primary:hover {
  border-color: var(--accent-soft);
  background: var(--accent-soft);
}

body .pbgui-dialog-btn.danger {
  border-color: rgb(var(--danger-rgb) / 0.4);
  background: rgb(var(--danger-rgb) / 0.14);
  color: var(--danger-soft);
}

body .pbgui-dialog-btn.danger:hover {
  border-color: var(--danger);
  background: rgb(var(--danger-rgb) / 0.22);
  color: var(--danger-soft);
}

@media (prefers-reduced-motion: no-preference) {
  body #pbgui-dialog-ovl.visible #pbgui-dialog-box {
    animation: api-keys-dialog-enter 150ms var(--ease-standard);
  }
}

@keyframes api-keys-dialog-enter {
  from { opacity: 0; transform: translateY(6px) scale(0.99); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (max-width: 640px) {
  body #pbgui-dialog-ovl {
    align-items: flex-end;
    padding: 12px;
  }

  body #pbgui-dialog-box {
    width: 100%;
  }

  body #pbgui-dialog-actions,
  body .pbgui-dialog-btn {
    width: 100%;
  }
}
</style>

<style scoped>
/* Page-level AppShell overrides — ported from styles/api_keys_editor.css at
   the Tailwind migration. The :deep() rules target AppShell internals, so
   they stay as CSS instead of utilities. */
.data-page-shell :deep(.app-shell__main) {
  width: 100%;
  max-width: none;
  min-height: 0;
  padding: 0;
}

.data-page-shell :deep(.app-shell__primary) {
  min-height: 0;
}
</style>
