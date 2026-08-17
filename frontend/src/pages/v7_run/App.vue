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
import { useI18n } from 'vue-i18n';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
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

/* Page scroll lock while the backup panel is open (:1210). */
watch(
  () => backups.panelOpen.value,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : '';
  }
);

declare global {
  interface Window {
    PBGuiSidebarResize?: {
      init: (options: { sidebarId: string; handleId: string; minWidth: number; maxWidth: number }) => void;
    };
  }
}

onMounted(() => {
  document.title = t(adapter.titleKey); // :1449
  window.PBGuiSidebarResize?.init({ sidebarId: 'sidebar', handleId: 'sidebar-resize', minWidth: 140, maxWidth: 300 }); // :1461
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
  <nav id="topnav"></nav>

  <!-- Connection banner (:508) -->
  <div id="conn-banner" :class="'conn-' + store.banner.value">{{ t('v7run.connecting') }}</div>

  <!-- Page body: sidebar + main content (:511) -->
  <div id="page-body">
    <div id="sidebar">
      <div id="sidebar-sticky">
        <div id="sidebar-header">
          <span class="sb-title">{{ t('v7run.instances') }}</span>
          <span class="sb-count" id="instance-count">{{ store.countText.value }}</span>
        </div>
        <div id="sidebar-toolbar">
          <div class="sb-label">{{ t('common.search') }}</div>
          <input type="text" id="f-search" class="sb-input" v-model="store.filterSearch.value" :placeholder="t('v7run.searchPlaceholder')" />
          <div class="sb-label" style="margin-top:4px">{{ t('v7run.status') }}</div>
          <select id="f-status" class="sb-input" v-model="store.filterStatus.value">
            <option v-for="filter in STATUS_FILTERS" :key="filter.value" :value="filter.value">{{ t(filter.key) }}</option>
          </select>
          <hr class="sb-sep">
          <button class="sb-btn" @click="store.loadInstances()">&#x21BB; {{ t('common.refresh') }}</button>
          <button class="sb-btn" id="add-instance-btn" @click="store.addInstance()">&#x2795; {{ t(adapter.addInstanceKey) }}</button>
          <button class="sb-btn" @click="backups.open()">&#x1F4BE; {{ t('v7run.backups') }}</button>
        </div>
      </div>
      <div id="sidebar-resize"></div>
    </div>

    <div id="main-content">
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

  <div ref="toastEl" id="toast"></div>
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
      confirm-class="modal-btn-delete"
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
