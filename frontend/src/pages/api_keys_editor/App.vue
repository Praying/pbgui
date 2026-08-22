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
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { PhArchive, PhClipboardText, PhPlus } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import AppShell from '@/shared/components/AppShell.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
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

type SharedHelpGlobal = { open(keyword: string): void };

function wireHelpOpener(): void {
  (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER = () => {
    const shared = (window as Window & { PBGuiSharedHelp?: SharedHelpGlobal }).PBGuiSharedHelp;
    if (shared && typeof shared.open === 'function') shared.open('api_keys');
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
  setTimeout(() => document.getElementById('userFilter')?.focus(), 50);
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

/* ── Escape closes any open panel (:1167-1177) ── */

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && view.value !== 'list') void backToList();
}

/* ── sidebar resize (:3466-3486) ── */

const sidebarWidth = ref<number | null>(null);
let resizing = false;

function onResizeMove(event: MouseEvent): void {
  if (!resizing) return;
  sidebarWidth.value = Math.min(420, Math.max(160, event.clientX));
}

function onResizeUp(): void {
  if (!resizing) return;
  resizing = false;
  document.getElementById('sidebar-resize')?.classList.remove('active');
}

function startResize(event: MouseEvent): void {
  event.preventDefault();
  resizing = true;
  document.getElementById('sidebar-resize')?.classList.add('active');
}

/* ── pagehide secret hygiene (:1214, :2253-2259) ── */

function onPageHide(): void {
  editRef.value?.clearSecretInputs();
  tradfiStore.clearRevealedApiKey();
}

let removeUnauthorizedListener: (() => void) | null = null;

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown);
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeUp);
  window.removeEventListener('pagehide', onPageHide);
  removeUnauthorizedListener?.();
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
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeUp);
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
    setTimeout(() => document.getElementById('userFilter')?.focus(), 50);
  }
});
</script>

<template>
  <AppShell
    class="data-page-shell data-page-shell--api-keys"
    page-key="system_api_keys"
    :page-title="t('misc.apikeys.title')"
  >
    <MigrationWatermark />
    <template #status>
      <StatusStrip
        :label="t('shared.status')"
        :value="store.usersState.value === 'loading' ? t('common.loading') : store.usersState.value === 'error' ? t('common.error') : t('common.ok')"
        :tone="store.usersState.value === 'loading' ? 'warning' : store.usersState.value === 'error' ? 'danger' : 'success'"
      />
    </template>

    <div id="page-body">
      <!-- Sidebar -->
      <div id="sidebar" :style="sidebarWidth !== null ? { width: sidebarWidth + 'px' } : undefined">
        <div id="sidebar-sticky">
          <div id="sidebar-header">
            <span class="sb-title">{{ t('misc.apikeys.apiKeys') }}</span>
            <span class="sb-count" id="sb-count">
              {{ store.usersState.value === 'ready' ? t('misc.apikeys.usersCount', { count: store.users.value.length }) : store.usersState.value === 'error' ? t('common.error') : '…' }}
            </span>
            <span class="sb-count" id="sb-inuse" v-show="store.inUseCount.value > 0">
              {{ t('misc.apikeys.inUseCount', { count: store.inUseCount.value }) }}
            </span>
          </div>
          <div id="sidebar-toolbar">
            <button class="sb-btn primary" @click="showCreateForm"><PbIcon :icon="PhPlus" /> {{ t('misc.apikeys.addUser') }}</button>
            <hr class="sb-sep" />
            <button class="sb-btn info" id="btnHLExpiry" :disabled="hlChecking" @click="refreshHLExpiry">
              <span v-if="hlChecking" class="spinner"></span>{{ t('misc.apikeys.hlExpiryCheck') }}
            </button>
            <button class="sb-btn info" id="btnBybitExpiry" :disabled="bybitChecking" @click="refreshBybitExpiry">
              <span v-if="bybitChecking" class="spinner"></span>{{ t('misc.apikeys.bybitExpiryCheck') }}
            </button>
            <button class="sb-btn" id="btnHLConfig" :class="{ active: view === 'hlConfig' }" @click="view === 'hlConfig' ? backToList() : setPanelView('hlConfig', '#hl-config')">
              {{ t('misc.apikeys.hlWarningConfig') }}
            </button>
            <hr class="sb-sep" />
            <button class="sb-btn" id="btnTradfi" :class="{ active: view === 'tradfi' }" @click="view === 'tradfi' ? backToList() : setPanelView('tradfi', '#tradfi')">
              {{ t('misc.apikeys.tradfi') }}
            </button>
            <button class="sb-btn" id="btnComments" :class="{ active: view === 'comments' }" @click="view === 'comments' ? backToList() : setPanelView('comments', '#comments')">
              {{ t('misc.apikeys.comments') }}
            </button>
            <button class="sb-btn" id="btnBackups" :class="{ active: view === 'backups' }" @click="view === 'backups' ? backToList() : setPanelView('backups', '#backups')">
              <PbIcon :icon="PhArchive" /> {{ t('misc.apikeys.backups') }}
            </button>
            <button class="sb-btn" id="btnLogs" :class="{ active: view === 'logs' }" @click="view === 'logs' ? backToList() : setPanelView('logs', null)">
              <PbIcon :icon="PhClipboardText" /> {{ t('misc.apikeys.logs') }}
            </button>
          </div>
        </div>
        <div id="sidebar-resize" @mousedown="startResize"></div>
      </div>

      <div id="main-content">
        <!-- User list -->
        <UserListTable v-show="view === 'list'" :store="store" @edit="onEditUser" @delete="onDeleteUser" />

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
