<script setup lang="ts">
/*
 * DB Tools page — the Vue port of frontend/db_tools.html (1,240 lines;
 * legacy line refs below are provenance):
 *
 * ┌──────────────────────────┬─ Legacy regions ────────────────────────────┐
 * │ App (this shell)         │ markup :146-293, globals :295-306, panel    │
 * │                          │ switch :953-960, bootstrap :1218-1236        │
 * │ SelectList ×6            │ renderChecks :356-364, All/None :1009-1022, │
 * │                          │ drag-range select :961-1008                 │
 * │ PanelBits (status/       │ setStatus :325-334, renderProgress :902-921, │
 * │ progress/confirm)        │ confirmModal :880-900                       │
 * │ SyncSafetyView           │ formatSyncSafetyResult :562-603 (template,   │
 * │                          │ no markup strings)                          │
 * │ LogPanel                 │ :268-282 + :747-871 (LogViewerPanel global)  │
 * │ useDbTools               │ targets/users/backups/sync/dashboards loads,│
 * │                          │ previews + operations polling :922-951      │
 * │ config/lib               │ %% injections :297-301, format helpers       │
 * └──────────────────────────┴─────────────────────────────────────────────┘
 *
 * Deliberate deviations (documented):
 *  - setStatusHtml is gone: the sync safety result renders as the
 *    SyncSafetyView component (the legacy built escaped HTML strings).
 *  - The cleanup date keeps the legacy __dp datepicker global + trigger.
 *  - Poll/timer handles are disposed on unmount (legacy leaked them).
 */
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { PhCalendar } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import AppShell from '@/shared/components/AppShell.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import LogPanel from './components/LogPanel.vue';
import PanelBits from './components/PanelBits.vue';
import SelectList from './components/SelectList.vue';
import SyncSafetyView from './components/SyncSafetyView.vue';
import { formatBytes, backupCreatedLabel, shortSyncTime } from './lib/format';
import { useDbTools, type UserRow } from './composables/useDbTools';

const { t } = useI18n();

const store = useDbTools({ t: (key, params) => t(key, params ?? {}) });

const PANELS = [
  { key: 'cleanup', labelKey: 'misc.dbtools.cleanup' },
  { key: 'copy-users', labelKey: 'misc.dbtools.copyUsers' },
  { key: 'copy-db', labelKey: 'misc.dbtools.copyDatabase' },
  { key: 'sync-jobs', labelKey: 'misc.dbtools.syncJobs' },
  { key: 'backups', labelKey: 'misc.dbtools.backupManager' },
  { key: 'copy-dashboards', labelKey: 'misc.dbtools.dashboards' },
];

/* ── list row adapters (renderChecks semantics :356-364) ── */

function userRows(rows: Ref<UserRow[]>, loadingKey: string): Array<{ value: string; total?: number; loading?: string }> {
  if (!rows.value.length) {
    return [{ value: '', loading: t(loadingKey) }];
  }
  return rows.value.map((row) => ({ value: row.user, total: row.total }));
}

const cleanupRows = computed(() => userRows(store.cleanupUserRows, 'misc.dbtools.loadingUsers'));
const copyRows = computed(() => userRows(store.copyUserRows, 'misc.dbtools.loadingUsers'));
const syncRows = computed(() => userRows(store.syncUserRows, 'misc.dbtools.loadingUsers'));

function stringRows(values: string[], loadingKey?: string): Array<{ value: string; loading?: string }> {
  if (!values.length && loadingKey) return [{ value: '', loading: t(loadingKey) }];
  return values.map((value) => ({ value }));
}

/* ── target select helper ── */

function onTargetChange(source: 'users' | 'db' | 'dash', side: 'source' | 'target'): void {
  const pairs = {
    users: [store.usersSource, store.usersTarget],
    db: [store.dbSource, store.dbTarget],
    dash: [store.dashSource, store.dashTarget],
  } as const;
  store.syncTargetPair(pairs[source][0] as Ref<string>, pairs[source][1] as Ref<string>, side);
  if (source === 'users' && side === 'source') {
    store.usersPreview.value = null;
    void store.loadUsers(store.usersSource.value, 'copy');
  }
  if (source === 'users' && side === 'target') store.usersPreview.value = null;
  if (source === 'db') store.dbPreview.value = null;
  if (source === 'dash' && side === 'target') store.dashPreview.value = null;
}

/* ── backup list adapter (:369-392) ── */

const backupRows = computed(() =>
  store.sortedBackups.value.map((item) => {
    const sizeMb = Number(item.size || 0) / 1024 / 1024;
    const label = String(item.label || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const dbName = String(item.db_name || '');
    const dbLabel =
      dbName === 'pbgui.db' ? t('misc.dbtools.mainDb') : dbName === 'pbgui_trades.db' ? t('misc.dbtools.tradesDb') : dbName;
    return {
      name: item.name,
      created: backupCreatedLabel(item.name, item.mtime, t('misc.dbtools.unknownTime')),
      label: label || t('misc.dbtools.backup'),
      dbLabel,
      sizeLabel: sizeMb.toFixed(1) + ' MB',
    };
  })
);

const backupSummary = computed(() => {
  const totalBytes = store.backups.value.reduce((sum, item) => sum + Number(item.size || 0), 0);
  return t('misc.dbtools.filesSummary', {
    count: String(store.backups.value.length),
    size: formatBytes(totalBytes),
  });
});

function sortMark(key: string): string {
  if (store.backupSort.value.key !== key) return '';
  return store.backupSort.value.dir === 'asc' ? ' ▲' : ' ▼';
}

/* ── sync job list (:694-720) ── */

const syncJobRows = computed(() =>
  store.syncJobs.value.map((job) => ({
    job,
    pillClass: job.last_error ? 'error' : job.enabled ? 'enabled' : 'disabled',
    pillText: job.last_error ? t('misc.dbtools.error') : job.enabled ? t('misc.dbtools.enabled') : t('misc.dbtools.disabled'),
  }))
);

/* ── log panel state (:768-795) ── */

const logVisible = ref(false);
const logTitle = ref('');
const logFile = ref('');

function openJobLog(jobId: string): void {
  const info = store.logFileForJob(jobId);
  logTitle.value = info.title;
  logFile.value = info.file;
  logVisible.value = true;
}

/* ── datepicker trigger (legacy __dp global :172) ── */

declare global {
  interface Window {
    __dp?: { show(id: string, anchor: unknown): void };
  }
}

function openCleanupCalendar(event: MouseEvent): void {
  window.__dp?.show('cleanup-date', event.target);
}

function shortSyncTimeText(value: unknown): string {
  return shortSyncTime(value);
}

function toggleInList(list: Ref<string[]>, value: string, selected: boolean): void {
  const next = new Set(list.value);
  if (selected) next.add(value);
  else next.delete(value);
  list.value = [...next];
}


onMounted(() => {
  document.title = t('misc.dbtools.title'); // :296
  void store.bootstrap();
});

onBeforeUnmount(() => store.teardown());
</script>

<template>
  <AppShell
    class="data-page-shell data-page-shell--db-tools"
    page-key="system_db_tools"
    :page-title="t('misc.dbtools.pageTitle')"
    :page-description="t('misc.dbtools.pageSub')"
  >
    <template #status>
      <StatusStrip
        :label="t('shared.status')"
        :value="store.statuses.value[store.activePanel.value]?.text || t('common.ok')"
        :tone="store.statuses.value[store.activePanel.value]?.kind === 'err' ? 'danger' : store.statuses.value[store.activePanel.value]?.kind === 'ok' ? 'success' : 'neutral'"
      />
    </template>

  <div id="page-body">
    <aside id="sidebar">
      <div class="sb-title">{{ t('misc.dbtools.sbTitle') }}</div>
      <button
        v-for="panel in PANELS"
        :key="panel.key"
        class="sb-btn"
        :class="{ active: store.activePanel.value === panel.key }"
        @click="store.activePanel.value = panel.key"
      >{{ t(panel.labelKey) }}</button>
    </aside>
    <div id="main-content">
      <div class="page-head">
        <div>
          <h1 class="page-title">{{ t('misc.dbtools.pageTitle') }}</h1>
          <div class="page-sub">{{ t('misc.dbtools.pageSub') }}</div>
        </div>
      </div>

      <!-- Cleanup -->
      <section class="panel" id="panel-cleanup" :class="{ active: store.activePanel.value === 'cleanup' }">
        <div class="panel-head">
          <div class="panel-title">{{ t('misc.dbtools.cleanupUserData') }}</div>
          <div class="panel-desc">{{ t('misc.dbtools.cleanupUserDataDesc') }}</div>
        </div>
        <div class="panel-body">
          <div class="grid">
            <div class="field">
              <label for="cleanup-target">{{ t('misc.dbtools.targetMaster') }}</label>
              <select id="cleanup-target" v-model="store.cleanupTarget.value" @change="store.cleanupPreview.value = null; store.loadUsers(store.cleanupTarget.value, 'cleanup')">
                <option v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</option>
              </select>
            </div>
            <div class="field">
              <label for="cleanup-mode">{{ t('misc.dbtools.cleanupMode') }}</label>
              <select id="cleanup-mode" v-model="store.cleanupMode.value">
                <option value="all">{{ t('misc.dbtools.removeAllData') }}</option>
                <option value="older">{{ t('misc.dbtools.removeOlderThan') }}</option>
              </select>
            </div>
            <div class="field">
              <label for="cleanup-date">{{ t('misc.dbtools.cutoffDate') }}</label>
              <div class="date-input-wrap">
                <input id="cleanup-date" v-model="store.cleanupDate.value" type="text" placeholder="YYYY-MM-DD" autocomplete="off">
                <button type="button" class="calendar-trigger" :title="t('misc.dbtools.openCalendar')" :aria-label="t('misc.dbtools.openCalendar')" @click="openCleanupCalendar"><PbIcon :icon="PhCalendar" /></button>
              </div>
            </div>
          </div>
          <SelectList
            id="cleanup-users"
            :rows="cleanupRows"
            :selected="store.cleanupUsers.value"
            show-totals
            @toggle="(value, selected) => { toggleInList(store.cleanupUsers, value, selected); store.cleanupPreview.value = null; }"
            @set-all="(values) => { store.cleanupUsers.value = values; store.cleanupPreview.value = null; }"
          >
            <template #title><div class="list-title">{{ t('misc.dbtools.users') }}</div></template>
          </SelectList>
          <div class="actions">
            <button class="btn pbgui-btn btn-secondary secondary" id="cleanup-refresh" @click="store.loadUsers(store.cleanupTarget.value, 'cleanup')">{{ t('misc.dbtools.refreshUsers') }}</button>
            <button class="btn pbgui-btn btn-primary primary" id="cleanup-preview" @click="store.previewCleanup()">{{ t('misc.dbtools.preview') }}</button>
            <button class="btn pbgui-btn btn-danger danger" id="cleanup-run" :disabled="!store.cleanupPreview.value" @click="store.runCleanup()">{{ t('misc.dbtools.runCleanup') }}</button>
          </div>
          <PanelBits
            status-id="cleanup-status"
            :status="store.statuses.value.cleanup"
            :progress="store.progress.value.cleanup"
            :confirm="store.confirmState.value"
            @confirm="store.resolveConfirm"
          />
        </div>
      </section>

      <!-- Copy users -->
      <section class="panel" id="panel-copy-users" :class="{ active: store.activePanel.value === 'copy-users' }">
        <div class="panel-head">
          <div class="panel-title">{{ t('misc.dbtools.copyUserData') }}</div>
          <div class="panel-desc">{{ t('misc.dbtools.copyUserDataDesc') }}</div>
        </div>
        <div class="panel-body">
          <div class="grid">
            <div class="field">
              <label for="users-source">{{ t('misc.dbtools.sourceMaster') }}</label>
              <select id="users-source" v-model="store.usersSource.value" @change="onTargetChange('users', 'source')">
                <option v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</option>
              </select>
            </div>
            <div class="field">
              <label for="users-target">{{ t('misc.dbtools.targetMaster') }}</label>
              <select id="users-target" v-model="store.usersTarget.value" @change="onTargetChange('users', 'target')">
                <option v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</option>
              </select>
            </div>
            <div class="field">
              <label for="users-mode">{{ t('misc.dbtools.copyMode') }}</label>
              <select id="users-mode" v-model="store.usersMode.value">
                <option value="add_missing">{{ t('misc.dbtools.addOnlyMissing') }}</option>
                <option value="replace">{{ t('misc.dbtools.replaceUserData') }}</option>
              </select>
            </div>
          </div>
          <SelectList
            id="copy-users-list"
            :rows="copyRows"
            :selected="store.copyUsers.value"
            show-totals
            @toggle="(value, selected) => { toggleInList(store.copyUsers, value, selected); store.usersPreview.value = null; }"
            @set-all="(values) => { store.copyUsers.value = values; store.usersPreview.value = null; }"
          >
            <template #title><div class="list-title">{{ t('misc.dbtools.usersFromSource') }}</div></template>
          </SelectList>
          <div class="actions">
            <button class="btn pbgui-btn btn-secondary secondary" id="users-refresh" @click="store.loadUsers(store.usersSource.value, 'copy')">{{ t('misc.dbtools.refreshSourceUsers') }}</button>
            <button class="btn pbgui-btn btn-primary primary" id="users-preview" @click="store.previewCopyUsers()">{{ t('misc.dbtools.preview') }}</button>
            <button class="btn warning" id="users-run" :disabled="!store.usersPreview.value" @click="store.runCopyUsers()">{{ t('misc.dbtools.copyUsers') }}</button>
          </div>
          <PanelBits
            status-id="users-status"
            :status="store.statuses.value.users"
            :progress="store.progress.value.users"
            :confirm="store.confirmState.value"
            @confirm="store.resolveConfirm"
          />
        </div>
      </section>

      <!-- Copy database -->
      <section class="panel" id="panel-copy-db" :class="{ active: store.activePanel.value === 'copy-db' }">
        <div class="panel-head">
          <div class="panel-title">{{ t('misc.dbtools.copyCompleteDatabase') }}</div>
          <div class="panel-desc">{{ t('misc.dbtools.copyCompleteDatabaseDesc') }}</div>
        </div>
        <div class="panel-body">
          <!-- static dictionary markup (legacy data-i18n-html) — controlled template, not server data -->
          <div class="notice" v-html="t('misc.dbtools.copyDbNotice')"></div>
          <div class="grid">
            <div class="field">
              <label for="db-source">{{ t('misc.dbtools.sourceMaster') }}</label>
              <select id="db-source" v-model="store.dbSource.value" @change="onTargetChange('db', 'source')">
                <option v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</option>
              </select>
            </div>
            <div class="field">
              <label for="db-target">{{ t('misc.dbtools.targetMaster') }}</label>
              <select id="db-target" v-model="store.dbTarget.value" @change="onTargetChange('db', 'target')">
                <option v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</option>
              </select>
            </div>
          </div>
          <div class="actions">
            <button class="btn primary" id="db-preview" @click="store.previewCopyDb()">{{ t('misc.dbtools.preview') }}</button>
            <button class="btn danger" id="db-run" :disabled="!store.dbPreview.value" @click="store.runCopyDb()">{{ t('misc.dbtools.copyDatabase') }}</button>
          </div>
          <PanelBits
            status-id="db-status"
            :status="store.statuses.value.db"
            :progress="store.progress.value.db"
            :confirm="store.confirmState.value"
            @confirm="store.resolveConfirm"
          />
        </div>
      </section>

      <!-- Sync jobs -->
      <section class="panel" id="panel-sync-jobs" :class="{ active: store.activePanel.value === 'sync-jobs' }">
        <div class="panel-head">
          <div class="panel-title">{{ t('misc.dbtools.syncJobs') }}</div>
          <div class="panel-desc">{{ t('misc.dbtools.syncJobsDesc') }}</div>
        </div>
        <div class="panel-body">
          <div class="notice">{{ t('misc.dbtools.syncJobsNotice') }}</div>
          <div class="list-card">
            <div class="list-head">
              <div class="list-title">{{ t('misc.dbtools.configuredSyncJobs') }}</div>
              <div class="list-actions">
                <button class="btn secondary mini" id="sync-reload" @click="store.loadSyncJobs()">{{ t('misc.dbtools.reload') }}</button>
                <button class="btn primary mini" id="sync-new" @click="store.newSyncJob()">{{ t('misc.dbtools.newJob') }}</button>
              </div>
            </div>
            <div class="select-list" id="sync-job-list">
              <div class="sync-job-table-head">
                <span>{{ t('misc.dbtools.name') }}</span>
                <span>{{ t('misc.dbtools.status') }}</span>
                <span>{{ t('misc.dbtools.source') }}</span>
                <span>{{ t('misc.dbtools.targets') }}</span>
                <span>{{ t('misc.dbtools.lastRun') }}</span>
                <span>{{ t('misc.dbtools.nextRun') }}</span>
                <span>{{ t('misc.dbtools.users') }}</span>
                <span>{{ t('misc.dbtools.log') }}</span>
              </div>
              <div v-if="!syncJobRows.length" class="select-row" aria-disabled="true">{{ t('misc.dbtools.noSyncJobsConfigured') }}</div>
              <div
                v-for="row in syncJobRows"
                :key="row.job.id"
                class="sync-job-row"
                role="button"
                tabindex="0"
                :class="{ selected: row.job.id === store.syncJobId.value }"
                :data-job-id="row.job.id"
                @click="row.job.id === store.syncJobId.value ? store.closeSyncEditor() : store.selectSyncJob(row.job.id)"
                @keydown.enter.prevent="row.job.id === store.syncJobId.value ? store.closeSyncEditor() : store.selectSyncJob(row.job.id)"
                @keydown.space.prevent="row.job.id === store.syncJobId.value ? store.closeSyncEditor() : store.selectSyncJob(row.job.id)"
              >
                <span class="sync-job-cell sync-job-name">{{ row.job.name || row.job.id }}</span>
                <span class="sync-job-cell"><span class="sync-pill" :class="row.pillClass">{{ row.pillText }}</span></span>
                <span class="sync-job-cell">{{ row.job.source || '-' }}</span>
                <span class="sync-job-cell">{{ (row.job.targets || []).join(', ') || '-' }}</span>
                <span class="sync-job-cell">{{ shortSyncTimeText(row.job.last_run) }}</span>
                <span class="sync-job-cell">{{ shortSyncTimeText(row.job.next_run) }}</span>
                <span class="sync-job-cell">{{ (row.job.users || []).length }}</span>
                <span class="sync-job-cell">
                  <button class="btn secondary mini" type="button" :data-log-job="row.job.id" @click.stop="openJobLog(row.job.id)">{{ t('misc.dbtools.log') }}</button>
                </span>
              </div>
            </div>
          </div>

          <div class="sync-editor" id="sync-editor" :class="{ visible: store.syncEditorVisible.value }">
            <div class="sync-editor-head">
              <div class="sync-editor-title" id="sync-editor-title">{{ store.syncEditorTitle.value || t('misc.dbtools.newSyncJob') }}</div>
              <button class="btn secondary mini" id="sync-close" @click="store.closeSyncEditor()">{{ t('misc.dbtools.closeEditor') }}</button>
            </div>
            <div class="grid">
              <div class="field">
                <label for="sync-name">{{ t('misc.dbtools.jobName') }}</label>
                <input id="sync-name" v-model="store.syncName.value" type="text" placeholder="e.g. manibot01 to replicas">
              </div>
              <div class="field">
                <label for="sync-source">{{ t('misc.dbtools.sourceMaster') }}</label>
                <select id="sync-source" v-model="store.syncSource.value" @change="store.loadUsers(store.syncSource.value, 'sync')">
                  <option v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</option>
                </select>
              </div>
              <div class="field">
                <label for="sync-interval">{{ t('misc.dbtools.intervalSeconds') }}</label>
                <input id="sync-interval" v-model="store.syncInterval.value" type="number" min="30" step="30">
              </div>
              <div class="field">
                <label>{{ t('misc.dbtools.status') }}</label>
                <label class="check-line">
                  <input id="sync-enabled" v-model="store.syncEnabled.value" type="checkbox">
                  <span>{{ t('common.enabled') }}</span>
                </label>
              </div>
            </div>
            <div class="grid">
              <SelectList
                id="sync-targets"
                :rows="stringRows(store.syncTargetIds.value)"
                :selected="store.syncTargets.value"
                @toggle="(value, selected) => toggleInList(store.syncTargets, value, selected)"
                @set-all="(values) => (store.syncTargets.value = values)"
              >
                <template #title><div class="list-title">{{ t('misc.dbtools.targetMasters') }}</div></template>
              </SelectList>
              <SelectList
                id="sync-users"
                :rows="syncRows"
                :selected="store.syncUsers.value"
                show-totals
                @toggle="(value, selected) => toggleInList(store.syncUsers, value, selected)"
                @set-all="(values) => (store.syncUsers.value = values)"
              >
                <template #title><div class="list-title">{{ t('misc.dbtools.usersFromSource') }}</div></template>
              </SelectList>
            </div>
            <div class="actions">
              <button class="btn secondary" id="sync-refresh-users" @click="store.loadUsers(store.syncSource.value, 'sync')">{{ t('misc.dbtools.refreshUsers') }}</button>
              <button class="btn primary" id="sync-safety" @click="store.checkSyncSafety()">{{ t('misc.dbtools.checkSafety') }}</button>
              <button class="btn warning" id="sync-save" @click="store.saveSyncJob()">{{ t('misc.dbtools.saveJob') }}</button>
              <button class="btn primary" id="sync-run" @click="store.runSyncJobNow()">{{ t('misc.dbtools.runNow') }}</button>
              <button class="btn danger" id="sync-delete" @click="store.deleteSyncJob()">{{ t('misc.dbtools.deleteJob') }}</button>
            </div>
          </div>

          <SyncSafetyView
            v-if="store.syncSafety.value"
            :safety="store.syncSafety.value"
            :users="store.syncUsers.value"
          />
          <div v-else-if="store.statuses.value.sync" class="status" :class="store.statuses.value.sync.kind">{{ store.statuses.value.sync.text }}</div>
          <PanelBits
            :status="undefined"
            :progress="store.progress.value.sync"
            :confirm="store.confirmState.value"
            @confirm="store.resolveConfirm"
          />
        </div>
      </section>

      <!-- Backups -->
      <section class="panel" id="panel-backups" :class="{ active: store.activePanel.value === 'backups' }">
        <div class="panel-head">
          <div class="panel-title">{{ t('misc.dbtools.backupManager') }}</div>
          <div class="panel-desc">{{ t('misc.dbtools.backupManagerDesc') }}</div>
        </div>
        <div class="panel-body">
          <div class="notice">{{ t('misc.dbtools.restoreNotice') }}</div>
          <div class="grid">
            <div class="field">
              <label for="backup-target">{{ t('misc.dbtools.backupMaster') }}</label>
              <select id="backup-target" v-model="store.backupTarget.value" @change="store.loadBackups()">
                <option v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</option>
              </select>
            </div>
          </div>
          <div class="list-card backup-list-card">
            <div class="list-head">
              <div class="list-title">{{ t('misc.dbtools.databaseBackups') }}</div>
              <div class="list-actions">
                <span class="list-summary" id="backup-total-summary">{{ backupSummary }}</span>
                <button class="btn secondary mini" @click="store.backupSelected.value = backupRows.map((row) => row.name)">{{ t('common.all') }}</button>
                <button class="btn secondary mini" @click="store.backupSelected.value = []">{{ t('common.none') }}</button>
              </div>
            </div>
            <div class="select-list" id="backup-list">
              <div class="backup-table-head">
                <button type="button" @click="store.toggleBackupSort('created')">{{ t('misc.dbtools.created') }}{{ sortMark('created') }}</button>
                <button type="button" @click="store.toggleBackupSort('label')">{{ t('misc.dbtools.operation') }}{{ sortMark('label') }}</button>
                <button type="button" @click="store.toggleBackupSort('db')">{{ t('misc.dbtools.file') }}{{ sortMark('db') }}</button>
                <button type="button" @click="store.toggleBackupSort('size')">{{ t('misc.dbtools.size') }}{{ sortMark('size') }}</button>
                <button type="button" @click="store.toggleBackupSort('name')">{{ t('misc.dbtools.backupName') }}{{ sortMark('name') }}</button>
              </div>
              <div v-if="!backupRows.length" class="select-row" aria-disabled="true">{{ t('misc.dbtools.noBackupsFound') }}</div>
              <button
                v-for="row in backupRows"
                :key="row.name"
                class="select-row backup-row"
                type="button"
                :class="{ selected: store.backupSelected.value.includes(row.name) }"
                :data-value="row.name"
                :aria-pressed="store.backupSelected.value.includes(row.name) ? 'true' : 'false'"
                @click="toggleInList(store.backupSelected, row.name, !store.backupSelected.value.includes(row.name))"
              >
                <span class="backup-cell backup-date">{{ row.created }}</span>
                <span class="backup-cell"><span class="backup-badge">{{ row.label }}</span></span>
                <span class="backup-cell"><span class="backup-badge">{{ row.dbLabel }}</span></span>
                <span class="backup-cell backup-size">{{ row.sizeLabel }}</span>
                <span class="backup-cell backup-file">{{ row.name }}</span>
              </button>
            </div>
          </div>
          <div class="actions">
            <button class="btn secondary" id="backup-refresh" @click="store.loadBackups()">{{ t('misc.dbtools.refreshBackups') }}</button>
            <button class="btn warning" id="backup-restore" @click="store.runBackupRestore()">{{ t('misc.dbtools.restoreSelected') }}</button>
            <button class="btn danger" id="backup-delete" @click="store.runBackupDelete()">{{ t('misc.dbtools.deleteSelected') }}</button>
          </div>
          <PanelBits
            status-id="backup-status"
            :status="store.statuses.value.backup"
            :progress="store.progress.value.backup"
            :confirm="store.confirmState.value"
            @confirm="store.resolveConfirm"
          />
        </div>
      </section>

      <!-- Copy dashboards -->
      <section class="panel" id="panel-copy-dashboards" :class="{ active: store.activePanel.value === 'copy-dashboards' }">
        <div class="panel-head">
          <div class="panel-title">{{ t('misc.dbtools.copyDashboardsAndTemplates') }}</div>
          <div class="panel-desc">{{ t('misc.dbtools.copyDashboardsAndTemplatesDesc') }}</div>
        </div>
        <div class="panel-body">
          <div class="grid">
            <div class="field">
              <label for="dash-source">{{ t('misc.dbtools.sourceMaster') }}</label>
              <select id="dash-source" v-model="store.dashSource.value" @change="onTargetChange('dash', 'source'); store.loadDashboards()">
                <option v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</option>
              </select>
            </div>
            <div class="field">
              <label for="dash-target">{{ t('misc.dbtools.targetMaster') }}</label>
              <select id="dash-target" v-model="store.dashTarget.value" @change="onTargetChange('dash', 'target')">
                <option v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</option>
              </select>
            </div>
            <div class="field">
              <label for="dash-mode">{{ t('misc.dbtools.copyMode') }}</label>
              <select id="dash-mode" v-model="store.dashMode.value">
                <option value="add_missing">{{ t('misc.dbtools.addOnlyMissing') }}</option>
                <option value="replace_all">{{ t('misc.dbtools.replaceAllSelected') }}</option>
              </select>
            </div>
          </div>
          <div class="grid">
            <SelectList
              id="dash-list"
              :rows="stringRows(store.dashboards.value, 'misc.dbtools.loadingDashboards')"
              :selected="store.dashSelected.value"
              @toggle="(value, selected) => { toggleInList(store.dashSelected, value, selected); store.dashPreview.value = null; }"
              @set-all="(values) => { store.dashSelected.value = values; store.dashPreview.value = null; }"
            >
              <template #title><div class="list-title">{{ t('misc.dbtools.dashboards') }}</div></template>
            </SelectList>
            <SelectList
              id="template-list"
              :rows="stringRows(store.templates.value, 'misc.dbtools.loadingTemplates')"
              :selected="store.templateSelected.value"
              @toggle="(value, selected) => { toggleInList(store.templateSelected, value, selected); store.dashPreview.value = null; }"
              @set-all="(values) => { store.templateSelected.value = values; store.dashPreview.value = null; }"
            >
              <template #title><div class="list-title">{{ t('misc.dbtools.templates') }}</div></template>
            </SelectList>
          </div>
          <div class="actions">
            <button class="btn secondary" id="dash-refresh" @click="store.loadDashboards()">{{ t('misc.dbtools.refreshSourceItems') }}</button>
            <button class="btn primary" id="dash-preview" @click="store.previewCopyDashboards()">{{ t('misc.dbtools.preview') }}</button>
            <button class="btn warning" id="dash-run" :disabled="!store.dashPreview.value" @click="store.runCopyDashboards()">{{ t('misc.dbtools.copyDashboards') }}</button>
          </div>
          <PanelBits
            status-id="dash-status"
            :status="store.statuses.value.dash"
            :progress="store.progress.value.dash"
            :confirm="store.confirmState.value"
            @confirm="store.resolveConfirm"
          />
        </div>
      </section>
    </div>
  </div>

  <LogPanel :visible="logVisible" :title="logTitle" :log-file="logFile" @close="logVisible = false" />
</AppShell>
</template>
