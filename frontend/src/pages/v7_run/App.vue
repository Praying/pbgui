<script setup lang="ts">
/*
 * PBv7/PBv8 Run list page — the Vue port of frontend/v7_run.html
 * (1477 lines; legacy line refs below are provenance). Both routes serve
 * this one build: /api/v7/main_page and /api/v8/main_page — config.ts
 * derives the adapter (the port of frontend/js/run_list_adapter.js) from
 * the serving path.
 *
 * ┌────────────────────────┬─ Legacy regions ─────────────────────────────┐
 * │ App (this shell)       │ markup :502-564, banner :52-62/:1409-1415,   │
 * │                        │ globals :566-582, boot :1447-1461            │
 * │ InstanceTable          │ COLS/buildCells/createTr/render :664-891,    │
 * │                        │ header sort :740-768, click/dblclick         │
 * │                        │ delegation :1427-1445                        │
 * │ Pb8UpdateWarning       │ renderPb8UpdateWarning :770-788              │
 * │ ConfirmModal           │ delete modal :950-967, forced-mode modal     │
 * │                        │ :1038-1055                                   │
 * │ BackupPanel            │ openBackups :1122-1213, fetchBackups         │
 * │                        │ :1273-1343, retention :1215-1271             │
 * │ BackupConfirmOverlay   │ openBackupConfirm :1089-1119                 │
 * │ useRunInstances        │ loadInstances :593-609, edit :899-908,       │
 * │                        │ convert :910-941, delete :943-1001, balance  │
 * │                        │ :1003-1028, forced mode :1030-1077           │
 * │ useRunWs               │ connectWS/scheduleReconnect :611-662         │
 * │ useBackups             │ backup flows :1084-1386                      │
 * │ config/lib             │ run_list_adapter.js (whole file),            │
 * │                        │ %% injections :567-574, toast :1388-1407     │
 * └────────────────────────┴──────────────────────────────────────────────┘
 *
 * Deliberate deviations (documented):
 *  - fetches carry the boot Bearer token in addition to the cookie
 *    (legacy apiFetch was cookie-only :585-591);
 *  - NAV_CONFIG drops MASTER_NAME: the nav updates the master pill from
 *    /api/server-status on load (pbgui_nav.js:1509-1515), so the injected
 *    initial value is redundant; run_list_adapter.js is not loaded — its
 *    table lives in config.ts;
 *  - modal/panel/tree markup is re-rendered declaratively instead of the
 *    legacy row-diff innerHTML patching (:840-876) — same ids/classes.
 */
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { PhArrowsClockwise, PhFloppyDisk, PhPlus, PhQuestion } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import AppShell from '@/shared/components/AppShell.vue';
import IconButton from '@/shared/components/IconButton.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import BackupConfirmOverlay from './components/BackupConfirmOverlay.vue';
import BackupPanel from './components/BackupPanel.vue';
import ConfirmModal from './components/ConfirmModal.vue';
import InstanceTable from './components/InstanceTable.vue';
import Pb8UpdateWarning from './components/Pb8UpdateWarning.vue';
import { FORCED_MODES, useRunInstances } from './composables/useRunInstances';
import { useRunWs } from './composables/useRunWs';
import { useBackups } from './composables/useBackups';
import { currentRunAdapter, wsUrl } from './config';
import { STATUS_FILTERS } from './lib/table';
import { createToast } from './lib/toast';

const { t } = useI18n();

/** Banner state → Tailwind utilities (the former v7-run.css .conn-* rules;
    conn-ok was display:none in legacy). */
function bannerClass(state: string): string {
  if (state === 'ok') return 'hidden';
  if (state === 'lost') return 'bg-danger text-[#f2f5fb]';
  return 'bg-warning text-accent-contrast';
}

const adapter = currentRunAdapter(); // :574 (legacy RUN_VERSION injection)

const toastEl = useTemplateRef<HTMLElement>('toastEl');
const toast = createToast(() => toastEl.value); // :1390-1407

const store = useRunInstances({ t: (key, params) => t(key, params ?? {}), adapter, toast });
const backups = useBackups({ t: (key, params) => t(key, params ?? {}), adapter, toast });

const ws = useRunWs({
  url: wsUrl(adapter), // :619
  onInstances: store.setInstancesFromWs, // :629-639
  onBanner: store.setBanner, // :623-652
});

function openRunHelp(): void {
  const sharedHelp = (window as Window & {
    PBGuiSharedHelp?: { open?: (topic: string) => void };
  }).PBGuiSharedHelp;
  sharedHelp?.open?.(adapter.isV8 ? '44_pbv8_run' : '34_pbv7_run');
}

/* Page scroll lock while the backup panel is open (:1210). */
watch(
  () => backups.panelOpen.value,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : '';
  }
);

onMounted(() => {
  document.title = t(adapter.titleKey); // :1449
  void store.loadInstances(); // :1452 — initial REST fetch for immediate data
  ws.connect(); // :1453 — then switch to real-time WebSocket
});

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  toast.dispose(); // deviation: legacy leaked the toast timer
});
</script>

<template>
  <MigrationWatermark />
  <AppShell
    class="core-workbench-shell core-workbench-shell--run"
    :page-key="adapter.navCurrent"
    :page-title="t(adapter.titleKey)"
    :page-family="adapter.isV8 ? 'PBv8' : 'PBv7'"
  >
    <template #header-actions>
      <IconButton
        class="pbgui-icon-button"
        :icon="PhQuestion"
        :label="t('nav.guide')"
        @click="openRunHelp"
      />
    </template>

    <!-- Connection banner (:508) -->
    <div id="conn-banner" class="px-4 py-2 text-center text-sm font-semibold transition-all duration-300" :class="bannerClass(store.banner.value)">{{ t('v7run.connecting') }}</div>

    <!-- Page body: filter/action toolbar + main content (:511). The filters
         and instance actions left the sidebar for a top strip; navigation
         lives in the workbench rail. -->
    <div id="page-body" class="flex h-[calc(100dvh-52px)] flex-col overflow-hidden">
    <div class="workbench-page-content min-w-0 flex-1 overflow-y-auto p-5 max-[760px]:p-2">
      <!-- Filters + instance actions: a top strip, not a sidebar. -->
      <div class="page-toolbar" role="toolbar">
        <span class="sb-label">{{ t('v7run.instances') }}&nbsp;<span class="sb-count" id="instance-count">{{ store.countText.value }}</span></span>
        <input type="text" id="f-search" class="sb-input" v-model="store.filterSearch.value" :placeholder="t('v7run.searchPlaceholder')" />
        <span class="sb-label">{{ t('v7run.status') }}</span>
        <select id="f-status" class="sb-input" v-model="store.filterStatus.value">
          <option v-for="filter in STATUS_FILTERS" :key="filter.value" :value="filter.value">{{ t(filter.key) }}</option>
        </select>
        <hr class="sb-sep">
        <button class="sb-btn" @click="store.loadInstances()"><PbIcon :icon="PhArrowsClockwise" /> {{ t('common.refresh') }}</button>
        <button class="sb-btn" id="add-instance-btn" @click="store.addInstance()"><PbIcon :icon="PhPlus" /> {{ t(adapter.addInstanceKey) }}</button>
        <button class="sb-btn" @click="backups.open()"><PbIcon :icon="PhFloppyDisk" /> {{ t('v7run.backups') }}</button>
      </div>
      <Pb8UpdateWarning :hosts="store.pb8Hosts.value" />
      <InstanceTable
        :rows="store.rows.value"
        :total-count="store.instances.value.length"
        :is-v8="adapter.isV8"
        :supports-forced-modes="adapter.supportsForcedModes"
        :supports-conversion="adapter.supportsConversion"
        :sort="store.sort.value"
        @edit="store.editInstance"
        @balance="store.openBalanceCalculator"
        @convert="store.convertInstanceToV8"
        @forced-mode="(name, mode) => store.requestForcedMode(name, mode as 'panic' | 'graceful_stop' | 'tp_only')"
        @remove="store.requestDelete"
        @sort="store.setSort"
      />
      </div>
    </div><!-- /page-body -->
  </AppShell>

  <div ref="toastEl" id="toast" class="fixed bottom-5 right-5 z-[9999] rounded-md px-5 py-2 text-sm font-semibold transition-opacity duration-300"></div>
  <div id="modal-root"></div>

  <Teleport to="#modal-root">
    <!-- Delete confirm (:951-962) -->
    <ConfirmModal
      v-if="store.pendingDeleteName.value"
      :title="t('v7run.deleteInstanceConfirm')"
      :warn="store.pendingDeleteName.value"
      :text="t('v7run.deleteInstanceWarning')"
      :cancel-text="t('common.cancel')"
      :confirm-text="t('common.delete')"
      confirm-class="bg-danger text-[#f2f5fb] border-danger hover:opacity-85"
      :busy="store.deleteBusy.value"
      :busy-text="t('v7run.deleting')"
      @cancel="store.cancelDelete()"
      @confirm="store.executeDelete()"
    />

    <!-- Forced-mode confirm (:1039-1050) -->
    <ConfirmModal
      v-if="store.pendingForced.value"
      :title="t(FORCED_MODES[store.pendingForced.value.mode]!.titleKey)"
      :warn="store.pendingForced.value.name"
      :text="t('v7run.forcedModeDetail', { mode: FORCED_MODES[store.pendingForced.value.mode]!.value })"
      :cancel-text="t('common.cancel')"
      :confirm-text="t(FORCED_MODES[store.pendingForced.value.mode]!.textKey)"
      :confirm-class="FORCED_MODES[store.pendingForced.value.mode]!.cssClass"
      :busy="store.forcedBusy.value"
      :busy-text="t('v7run.syncing')"
      @cancel="store.cancelForcedMode()"
      @confirm="store.executeForcedMode()"
    />

    <!-- Backup panel (:1125-1149) -->
    <BackupPanel
      v-if="backups.panelOpen.value"
      :retention="backups.retention.value"
      :retention-saved="backups.retentionSaved.value"
      :retention-msg="backups.retentionMsg.value"
      :filter-text="backups.filterText.value"
      :groups="backups.groups.value"
      :loading="backups.loading.value"
      :load-error="backups.loadError.value"
      @close="backups.close()"
      @step="backups.stepRetention"
      @save-retention="backups.saveRetention()"
      @update:retention="(value) => (backups.retention.value = value)"
      @update:filter-text="(value) => (backups.filterText.value = value)"
      @restore="backups.requestRestore"
      @delete-backup="backups.deleteBackup"
    />

    <!-- Rollback confirm (:1093-1112) -->
    <BackupConfirmOverlay
      v-if="backups.confirm.value"
      :name="backups.confirm.value.name"
      :ts="backups.confirm.value.ts"
      :running-hosts="backups.confirm.value.runningHosts"
      @cancel="backups.cancelRestore()"
      @confirm="backups.confirmRestore()"
    />
  </Teleport>
</template>
