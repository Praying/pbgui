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
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { aiFocusedField, useAiPageContext } from '@/shared/ai/context';
import type { PageSection } from '@/shared/navigation';
import LogPanel from './components/LogPanel.vue';
import PanelBits from './components/PanelBits.vue';
import { statusKindClass } from './lib/statusKind';
import SelectList from './components/SelectList.vue';
import SyncSafetyView from './components/SyncSafetyView.vue';
import { formatBytes, backupCreatedLabel, shortSyncTime } from './lib/format';
import { useDbTools, type UserRow } from './composables/useDbTools';

const { t } = useI18n();

/* Status → Tailwind utility mapping (the former db-tools.css .status.ok/.err
   tints). Returns the FULL colour set for the dynamic border+text pair. */
const store = useDbTools({ t: (key, params) => t(key, params ?? {}) });
/** Sync-table 8-column grid — shared by the sticky header and every row
 *  so the columns can't drift apart. */
const syncGridClass = 'grid min-w-[1160px] grid-cols-[minmax(180px,1.4fr)_90px_minmax(130px,.8fr)_minmax(150px,1fr)_minmax(150px,.9fr)_minmax(150px,.9fr)_70px_90px] items-center gap-3';
/** Backups-table 5-column grid — same header/row contract as syncGridClass. */
const backupsGridClass = 'grid min-w-[980px] grid-cols-[180px_150px_120px_110px_minmax(300px,1fr)] items-center gap-3';

const PANELS = [
  { key: 'cleanup', labelKey: 'misc.dbtools.cleanup' },
  { key: 'copy-users', labelKey: 'misc.dbtools.copyUsers' },
  { key: 'copy-db', labelKey: 'misc.dbtools.copyDatabase' },
  { key: 'sync-jobs', labelKey: 'misc.dbtools.syncJobs' },
  { key: 'backups', labelKey: 'misc.dbtools.backupManager' },
  { key: 'copy-dashboards', labelKey: 'misc.dbtools.dashboards' },
] as const;

/* Panels render as rail children (accordion under this page's entry) —
   the legacy in-page #sidebar column is retired. */
const sections = computed<PageSection[]>(() =>
  PANELS.map((panel) => ({ key: panel.key, label: t(panel.labelKey) })),
);

function onSectionSelect(panelKey: string): void {
  store.activePanel.value = panelKey;
}

/* AI drawer page context — Vue port of the legacy db-tools registration
   (active panel + sync-job name focus). */
useAiPageContext({
  id: 'db-tools',
  getContext: () => ({
    section: store.activePanel.value,
    focused_field: aiFocusedField({
      'sync-name': { path: 'db_tools.sync_job.name', label: 'Sync job name' },
    }),
  }),
});

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

/** Closed-state trigger label for the target selects (the listbox options
   mount lazily, so the trigger renders the text from the model). */
function targetOptionText(id: string): string {
  return store.targetOptions.value.find((option) => option.id === id)?.text ?? '';
}

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
    pillClass: job.last_error ? 'border-danger/35 bg-danger/12 text-danger-soft' : job.enabled ? 'border-success/30 bg-success/12 text-success-soft' : 'border-border-default bg-secondary/10 text-secondary',
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
  // The legacy __dp document click-guard hides the panel on the same click
  // that opens it: it only recognises a data-dp trigger, and PbIcon renders
  // an <svg>, so event.target carries no data-dp and the guard runs hide()
  // right after show(). Stop propagation so the panel stays open, and anchor
  // on the button (event.currentTarget) instead of the svg.
  event.stopPropagation();
  window.__dp?.show('cleanup-date', event.currentTarget);
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
    :sections="sections"
    :active-section="store.activePanel.value"
    @update:section="onSectionSelect"
  >
    <template #status>
      <StatusStrip
        :label="t('shared.status')"
        :value="store.statuses.value[store.activePanel.value]?.text || t('common.ok')"
        :tone="store.statuses.value[store.activePanel.value]?.kind === 'err' ? 'danger' : store.statuses.value[store.activePanel.value]?.kind === 'ok' ? 'success' : 'neutral'"
      />
    </template>

  <div id="page-body" class="flex h-[calc(100dvh-64px)] overflow-hidden max-[760px]:flex-col">
    <div id="main-content" class="min-w-0 flex-1 overflow-y-auto p-[var(--page-padding)]">
      <!-- Cleanup -->
      <section class="overflow-hidden rounded-xl border border-border-subtle bg-page shadow-panel" id="panel-cleanup" :class="store.activePanel.value === 'cleanup' ? 'active block' : 'hidden'">
        <div class="border-b border-border-subtle bg-card p-5">
          <div class="text-lg font-extrabold">{{ t('misc.dbtools.cleanupUserData') }}</div>
          <div class="mt-1 text-sm leading-[1.45] text-secondary">{{ t('misc.dbtools.cleanupUserDataDesc') }}</div>
        </div>
        <div class="grid gap-5 p-5">
          <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            <div class="grid gap-1.5">
              <span id="cleanup-target-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.targetMaster') }}</span>
              <SelectRoot :model-value="store.cleanupTarget.value" @update:model-value="store.cleanupTarget.value = $event; store.cleanupPreview.value = null; store.loadUsers(store.cleanupTarget.value, 'cleanup')">
                <SelectTrigger id="cleanup-target" aria-labelledby="cleanup-target-label">
                  <span :class="store.cleanupTarget.value ? undefined : 'text-placeholder'">{{ targetOptionText(store.cleanupTarget.value) }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <div class="grid gap-1.5">
              <span id="cleanup-mode-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.cleanupMode') }}</span>
              <SelectRoot v-model="store.cleanupMode.value">
                <SelectTrigger id="cleanup-mode" aria-labelledby="cleanup-mode-label">
                  <span>{{ store.cleanupMode.value === 'older' ? t('misc.dbtools.removeOlderThan') : t('misc.dbtools.removeAllData') }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{{ t('misc.dbtools.removeAllData') }}</SelectItem>
                  <SelectItem value="older">{{ t('misc.dbtools.removeOlderThan') }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <div class="grid gap-1.5">
              <span id="cleanup-date-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.cutoffDate') }}</span>
              <div class="date-input-wrap flex items-center gap-1">
                <Input id="cleanup-date" v-model="store.cleanupDate.value" type="text" placeholder="YYYY-MM-DD" autocomplete="off" aria-labelledby="cleanup-date-label" />
                <Button type="button" variant="ghost" size="icon" class="calendar-trigger shrink-0" :title="t('misc.dbtools.openCalendar')" :aria-label="t('misc.dbtools.openCalendar')" @click="openCleanupCalendar"><PbIcon :icon="PhCalendar" /></Button>
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
            <template #title><div class="text-sm font-extrabold text-primary">{{ t('misc.dbtools.users') }}</div></template>
          </SelectList>
          <div class="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" id="cleanup-refresh" @click="store.loadUsers(store.cleanupTarget.value, 'cleanup')">{{ t('misc.dbtools.refreshUsers') }}</Button>
            <Button type="button" variant="primary" id="cleanup-preview" @click="store.previewCleanup()">{{ t('misc.dbtools.preview') }}</Button>
            <Button type="button" variant="danger" id="cleanup-run" :disabled="!store.cleanupPreview.value" @click="store.runCleanup()">{{ t('misc.dbtools.runCleanup') }}</Button>
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
      <section class="overflow-hidden rounded-xl border border-border-subtle bg-page shadow-panel" id="panel-copy-users" :class="store.activePanel.value === 'copy-users' ? 'active block' : 'hidden'">
        <div class="border-b border-border-subtle bg-card p-5">
          <div class="text-lg font-extrabold">{{ t('misc.dbtools.copyUserData') }}</div>
          <div class="mt-1 text-sm leading-[1.45] text-secondary">{{ t('misc.dbtools.copyUserDataDesc') }}</div>
        </div>
        <div class="grid gap-5 p-5">
          <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            <div class="grid gap-1.5">
              <span id="users-source-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.sourceMaster') }}</span>
              <SelectRoot :model-value="store.usersSource.value" @update:model-value="store.usersSource.value = $event; onTargetChange('users', 'source')">
                <SelectTrigger id="users-source" aria-labelledby="users-source-label">
                  <span :class="store.usersSource.value ? undefined : 'text-placeholder'">{{ targetOptionText(store.usersSource.value) }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <div class="grid gap-1.5">
              <span id="users-target-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.targetMaster') }}</span>
              <SelectRoot :model-value="store.usersTarget.value" @update:model-value="store.usersTarget.value = $event; onTargetChange('users', 'target')">
                <SelectTrigger id="users-target" aria-labelledby="users-target-label">
                  <span :class="store.usersTarget.value ? undefined : 'text-placeholder'">{{ targetOptionText(store.usersTarget.value) }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <div class="grid gap-1.5">
              <span id="users-mode-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.copyMode') }}</span>
              <SelectRoot v-model="store.usersMode.value">
                <SelectTrigger id="users-mode" aria-labelledby="users-mode-label">
                  <span>{{ store.usersMode.value === 'replace' ? t('misc.dbtools.replaceUserData') : t('misc.dbtools.addOnlyMissing') }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add_missing">{{ t('misc.dbtools.addOnlyMissing') }}</SelectItem>
                  <SelectItem value="replace">{{ t('misc.dbtools.replaceUserData') }}</SelectItem>
                </SelectContent>
              </SelectRoot>
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
            <template #title><div class="text-sm font-extrabold text-primary">{{ t('misc.dbtools.usersFromSource') }}</div></template>
          </SelectList>
          <div class="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" id="users-refresh" @click="store.loadUsers(store.usersSource.value, 'copy')">{{ t('misc.dbtools.refreshSourceUsers') }}</Button>
            <Button type="button" variant="primary" id="users-preview" @click="store.previewCopyUsers()">{{ t('misc.dbtools.preview') }}</Button>
            <Button type="button" variant="warning" id="users-run" :disabled="!store.usersPreview.value" @click="store.runCopyUsers()">{{ t('misc.dbtools.copyUsers') }}</Button>
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
      <section class="overflow-hidden rounded-xl border border-border-subtle bg-page shadow-panel" id="panel-copy-db" :class="store.activePanel.value === 'copy-db' ? 'active block' : 'hidden'">
        <div class="border-b border-border-subtle bg-card p-5">
          <div class="text-lg font-extrabold">{{ t('misc.dbtools.copyCompleteDatabase') }}</div>
          <div class="mt-1 text-sm leading-[1.45] text-secondary">{{ t('misc.dbtools.copyCompleteDatabaseDesc') }}</div>
        </div>
        <div class="grid gap-5 p-5">
          <!-- static dictionary markup (legacy data-i18n-html) — controlled template, not server data -->
          <div class="rounded-[10px] border border-warning-deep/45 bg-warning/14 p-3 text-sm leading-[1.45] text-warning-soft" v-html="t('misc.dbtools.copyDbNotice')"></div>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            <div class="grid gap-1.5">
              <span id="db-source-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.sourceMaster') }}</span>
              <SelectRoot :model-value="store.dbSource.value" @update:model-value="store.dbSource.value = $event; onTargetChange('db', 'source')">
                <SelectTrigger id="db-source" aria-labelledby="db-source-label">
                  <span :class="store.dbSource.value ? undefined : 'text-placeholder'">{{ targetOptionText(store.dbSource.value) }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <div class="grid gap-1.5">
              <span id="db-target-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.targetMaster') }}</span>
              <SelectRoot :model-value="store.dbTarget.value" @update:model-value="store.dbTarget.value = $event; onTargetChange('db', 'target')">
                <SelectTrigger id="db-target" aria-labelledby="db-target-label">
                  <span :class="store.dbTarget.value ? undefined : 'text-placeholder'">{{ targetOptionText(store.dbTarget.value) }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" id="db-preview" @click="store.previewCopyDb()">{{ t('misc.dbtools.preview') }}</Button>
            <Button type="button" variant="danger" id="db-run" :disabled="!store.dbPreview.value" @click="store.runCopyDb()">{{ t('misc.dbtools.copyDatabase') }}</Button>
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
      <section class="overflow-hidden rounded-xl border border-border-subtle bg-page shadow-panel" id="panel-sync-jobs" :class="store.activePanel.value === 'sync-jobs' ? 'active block' : 'hidden'">
        <div class="border-b border-border-subtle bg-card p-5">
          <div class="text-lg font-extrabold">{{ t('misc.dbtools.syncJobs') }}</div>
          <div class="mt-1 text-sm leading-[1.45] text-secondary">{{ t('misc.dbtools.syncJobsDesc') }}</div>
        </div>
        <div class="grid gap-5 p-5">
          <div class="rounded-[10px] border border-warning-deep/45 bg-warning/14 p-3 text-sm leading-[1.45] text-warning-soft">{{ t('misc.dbtools.syncJobsNotice') }}</div>
          <div class="overflow-hidden rounded-[10px] border border-border-subtle bg-page">
            <div class="flex items-center justify-between gap-2 border-b border-border-subtle bg-card px-[0.8rem] py-[0.65rem]">
              <div class="text-sm font-extrabold text-primary">{{ t('misc.dbtools.configuredSyncJobs') }}</div>
              <div class="flex gap-1">
                <Button type="button" variant="secondary" size="sm" id="sync-reload" @click="store.loadSyncJobs()">{{ t('misc.dbtools.reload') }}</Button>
                <Button type="button" variant="primary" size="sm" id="sync-new" @click="store.newSyncJob()">{{ t('misc.dbtools.newJob') }}</Button>
              </div>
            </div>
            <div class="block max-h-[300px] select-none overflow-auto p-0" id="sync-job-list">
              <div :class="[syncGridClass, 'sticky top-0 z-[2] border-b-2 border-border-default bg-page px-3 py-2 text-xs font-extrabold tracking-[0.06em] text-secondary uppercase']">
                <span>{{ t('misc.dbtools.name') }}</span>
                <span>{{ t('misc.dbtools.status') }}</span>
                <span>{{ t('misc.dbtools.source') }}</span>
                <span>{{ t('misc.dbtools.targets') }}</span>
                <span>{{ t('misc.dbtools.lastRun') }}</span>
                <span>{{ t('misc.dbtools.nextRun') }}</span>
                <span>{{ t('misc.dbtools.users') }}</span>
                <span>{{ t('misc.dbtools.log') }}</span>
              </div>
              <div v-if="!syncJobRows.length" class="select-row w-full min-h-[34px] appearance-none cursor-pointer border-0 border-b border-border-subtle bg-transparent py-[7px] pl-2.5 pr-[10px] text-left text-primary hover:bg-white/3" aria-disabled="true">{{ t('misc.dbtools.noSyncJobsConfigured') }}</div>
              <div
                v-for="row in syncJobRows"
                :key="row.job.id"
                :class="[syncGridClass, 'w-full min-h-[44px] appearance-none cursor-pointer border-0 border-b border-border-subtle bg-transparent px-3 py-2 text-left text-primary font-inherit hover:bg-white/3', row.job.id === store.syncJobId.value ? 'selected bg-accent/12 text-primary shadow-[inset_3px_0_0_var(--accent)] pl-2' : '']"
                role="button"
                tabindex="0"
                :data-job-id="row.job.id"
                @click="row.job.id === store.syncJobId.value ? store.closeSyncEditor() : store.selectSyncJob(row.job.id)"
                @keydown.enter.prevent="row.job.id === store.syncJobId.value ? store.closeSyncEditor() : store.selectSyncJob(row.job.id)"
                @keydown.space.prevent="row.job.id === store.syncJobId.value ? store.closeSyncEditor() : store.selectSyncJob(row.job.id)"
              >
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-black text-primary">{{ row.job.name || row.job.id }}</span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"><span class="inline-flex items-center rounded-full border border-border-default px-2 py-0.5 text-xs font-black" :class="row.pillClass">{{ row.pillText }}</span></span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ row.job.source || '-' }}</span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ (row.job.targets || []).join(', ') || '-' }}</span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ shortSyncTimeText(row.job.last_run) }}</span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ shortSyncTimeText(row.job.next_run) }}</span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ (row.job.users || []).length }}</span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  <Button variant="secondary" size="sm" type="button" :data-log-job="row.job.id" @click.stop="openJobLog(row.job.id)">{{ t('misc.dbtools.log') }}</Button>
                </span>
              </div>
            </div>
          </div>

          <div class="hidden gap-5" id="sync-editor" :class="store.syncEditorVisible.value ? 'visible grid gap-5' : 'hidden'">
            <div class="flex items-center justify-between gap-3 rounded-[10px] border border-border-subtle bg-card px-[0.8rem] py-[0.65rem]">
              <div class="font-black text-primary" id="sync-editor-title">{{ store.syncEditorTitle.value || t('misc.dbtools.newSyncJob') }}</div>
              <Button type="button" variant="secondary" size="sm" id="sync-close" @click="store.closeSyncEditor()">{{ t('misc.dbtools.closeEditor') }}</Button>
            </div>
            <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
              <div class="grid gap-1.5">
                <label class="text-sm font-bold text-secondary" for="sync-name">{{ t('misc.dbtools.jobName') }}</label>
                <Input id="sync-name" v-model="store.syncName.value" type="text" placeholder="e.g. manibot01 to replicas" />
              </div>
              <div class="grid gap-1.5">
                <span id="sync-source-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.sourceMaster') }}</span>
                <SelectRoot :model-value="store.syncSource.value" @update:model-value="store.syncSource.value = $event; store.loadUsers(store.syncSource.value, 'sync')">
                  <SelectTrigger id="sync-source" aria-labelledby="sync-source-label">
                    <span :class="store.syncSource.value ? undefined : 'text-placeholder'">{{ targetOptionText(store.syncSource.value) }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
              <div class="grid gap-1.5">
                <label class="text-sm font-bold text-secondary" for="sync-interval">{{ t('misc.dbtools.intervalSeconds') }}</label>
                <Input id="sync-interval" v-model="store.syncInterval.value" type="number" min="30" step="30" />
              </div>
              <div class="grid gap-1.5">
                <label>{{ t('misc.dbtools.status') }}</label>
                <label class="inline-flex min-h-8 cursor-pointer items-center gap-2 font-bold text-primary">
                  <Checkbox id="sync-enabled" v-model="store.syncEnabled.value" />
                  <span>{{ t('common.enabled') }}</span>
                </label>
              </div>
            </div>
            <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
              <SelectList
                id="sync-targets"
                :rows="stringRows(store.syncTargetIds.value)"
                :selected="store.syncTargets.value"
                @toggle="(value, selected) => toggleInList(store.syncTargets, value, selected)"
                @set-all="(values) => (store.syncTargets.value = values)"
              >
                <template #title><div class="text-sm font-extrabold text-primary">{{ t('misc.dbtools.targetMasters') }}</div></template>
              </SelectList>
              <SelectList
                id="sync-users"
                :rows="syncRows"
                :selected="store.syncUsers.value"
                show-totals
                @toggle="(value, selected) => toggleInList(store.syncUsers, value, selected)"
                @set-all="(values) => (store.syncUsers.value = values)"
              >
                <template #title><div class="text-sm font-extrabold text-primary">{{ t('misc.dbtools.usersFromSource') }}</div></template>
              </SelectList>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" id="sync-refresh-users" @click="store.loadUsers(store.syncSource.value, 'sync')">{{ t('misc.dbtools.refreshUsers') }}</Button>
              <Button type="button" variant="primary" id="sync-safety" @click="store.checkSyncSafety()">{{ t('misc.dbtools.checkSafety') }}</Button>
              <Button type="button" variant="warning" id="sync-save" @click="store.saveSyncJob()">{{ t('misc.dbtools.saveJob') }}</Button>
              <Button type="button" variant="primary" id="sync-run" @click="store.runSyncJobNow()">{{ t('misc.dbtools.runNow') }}</Button>
              <Button type="button" variant="danger" id="sync-delete" @click="store.deleteSyncJob()">{{ t('misc.dbtools.deleteJob') }}</Button>
            </div>
          </div>

          <SyncSafetyView
            v-if="store.syncSafety.value"
            :safety="store.syncSafety.value"
            :users="store.syncUsers.value"
          />
          <div v-else-if="store.statuses.value.sync" class="min-h-11 whitespace-pre-wrap rounded-[10px] border border-border-subtle bg-page p-3 font-mono text-sm leading-[1.45] text-secondary" :class="statusKindClass(store.statuses.value.sync.kind)">{{ store.statuses.value.sync.text }}</div>
          <PanelBits
            :status="undefined"
            :progress="store.progress.value.sync"
            :confirm="store.confirmState.value"
            @confirm="store.resolveConfirm"
          />
        </div>
      </section>

      <!-- Backups -->
      <section id="panel-backups" class="min-h-[calc(100dvh-var(--header-height)-var(--nav-height))] overflow-hidden rounded-xl border border-border-subtle bg-page shadow-panel" :class="store.activePanel.value === 'backups' ? 'active block' : 'hidden'">
        <div class="border-b border-border-subtle bg-card p-5">
          <div class="text-lg font-extrabold">{{ t('misc.dbtools.backupManager') }}</div>
          <div class="mt-1 text-sm leading-[1.45] text-secondary">{{ t('misc.dbtools.backupManagerDesc') }}</div>
        </div>
        <div class="grid gap-5 p-5">
          <div class="rounded-[10px] border border-warning-deep/45 bg-warning/14 p-3 text-sm leading-[1.45] text-warning-soft">{{ t('misc.dbtools.restoreNotice') }}</div>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            <div class="grid gap-1.5">
              <span id="backup-target-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.backupMaster') }}</span>
              <SelectRoot :model-value="store.backupTarget.value" @update:model-value="store.backupTarget.value = $event; store.loadBackups()">
                <SelectTrigger id="backup-target" aria-labelledby="backup-target-label">
                  <span :class="store.backupTarget.value ? undefined : 'text-placeholder'">{{ targetOptionText(store.backupTarget.value) }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
          </div>
          <div class="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-border-subtle bg-page">
            <div class="flex items-center justify-between gap-2 border-b border-border-subtle bg-card px-[0.8rem] py-[0.65rem]">
              <div class="text-sm font-extrabold text-primary">{{ t('misc.dbtools.databaseBackups') }}</div>
              <div class="flex gap-1">
                <span class="mr-2 self-center text-xs font-extrabold text-secondary" id="backup-total-summary">{{ backupSummary }}</span>
                <Button type="button" variant="secondary" size="sm" @click="store.backupSelected.value = backupRows.map((row) => row.name)">{{ t('common.all') }}</Button>
                <Button type="button" variant="secondary" size="sm" @click="store.backupSelected.value = []">{{ t('common.none') }}</Button>
              </div>
            </div>
            <div id="backup-list" class="min-h-[360px] flex-1 select-none overflow-auto p-0">
              <div :class="[backupsGridClass, 'sticky top-0 z-[2] border-b-2 border-border-default bg-page px-3 py-2 text-xs font-extrabold tracking-[0.06em] text-secondary uppercase']">
                <Button type="button" variant="ghost" class="h-auto justify-start rounded-none border-0 p-0 text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-transparent active:scale-100" @click="store.toggleBackupSort('created')">{{ t('misc.dbtools.created') }}{{ sortMark('created') }}</Button>
                <Button type="button" variant="ghost" class="h-auto justify-start rounded-none border-0 p-0 text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-transparent active:scale-100" @click="store.toggleBackupSort('label')">{{ t('misc.dbtools.operation') }}{{ sortMark('label') }}</Button>
                <Button type="button" variant="ghost" class="h-auto justify-start rounded-none border-0 p-0 text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-transparent active:scale-100" @click="store.toggleBackupSort('db')">{{ t('misc.dbtools.file') }}{{ sortMark('db') }}</Button>
                <Button type="button" variant="ghost" class="h-auto justify-start rounded-none border-0 p-0 text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-transparent active:scale-100" @click="store.toggleBackupSort('size')">{{ t('misc.dbtools.size') }}{{ sortMark('size') }}</Button>
                <Button type="button" variant="ghost" class="h-auto justify-start rounded-none border-0 p-0 text-xs font-extrabold uppercase tracking-[0.06em] hover:bg-transparent active:scale-100" @click="store.toggleBackupSort('name')">{{ t('misc.dbtools.backupName') }}{{ sortMark('name') }}</Button>
              </div>
              <div v-if="!backupRows.length" class="select-row w-full min-h-[34px] appearance-none cursor-pointer border-0 border-b border-border-subtle bg-transparent py-[7px] pl-2.5 pr-[10px] text-left text-primary hover:bg-white/3" aria-disabled="true">{{ t('misc.dbtools.noBackupsFound') }}</div>
              <Button
                v-for="row in backupRows"
                :key="row.name"
                variant="ghost"
                :class="[backupsGridClass, 'backup-row min-h-[42px] w-full justify-start rounded-none border-0 border-b border-border-subtle bg-transparent px-3 py-2 text-left font-normal text-primary font-inherit hover:bg-white/3', store.backupSelected.value.includes(row.name) ? 'selected bg-accent/12 text-primary shadow-[inset_3px_0_0_var(--accent)] pl-2' : '']"
                type="button"
                :data-value="row.name"
                :aria-pressed="store.backupSelected.value.includes(row.name) ? 'true' : 'false'"
                @click="toggleInList(store.backupSelected, row.name, !store.backupSelected.value.includes(row.name))"
              >
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-extrabold text-primary">{{ row.created }}</span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"><span class="inline-flex items-center rounded-full border border-accent/24 bg-accent/9 px-2 py-px text-xs font-extrabold text-accent-soft">{{ row.label }}</span></span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"><span class="inline-flex items-center rounded-full border border-accent/24 bg-accent/9 px-2 py-px text-xs font-extrabold text-accent-soft">{{ row.dbLabel }}</span></span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right font-extrabold text-primary">{{ row.sizeLabel }}</span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-secondary">{{ row.name }}</span>
              </Button>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" id="backup-refresh" @click="store.loadBackups()">{{ t('misc.dbtools.refreshBackups') }}</Button>
            <Button type="button" variant="warning" id="backup-restore" @click="store.runBackupRestore()">{{ t('misc.dbtools.restoreSelected') }}</Button>
            <Button type="button" variant="danger" id="backup-delete" @click="store.runBackupDelete()">{{ t('misc.dbtools.deleteSelected') }}</Button>
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
      <section class="overflow-hidden rounded-xl border border-border-subtle bg-page shadow-panel" id="panel-copy-dashboards" :class="store.activePanel.value === 'copy-dashboards' ? 'active block' : 'hidden'">
        <div class="border-b border-border-subtle bg-card p-5">
          <div class="text-lg font-extrabold">{{ t('misc.dbtools.copyDashboardsAndTemplates') }}</div>
          <div class="mt-1 text-sm leading-[1.45] text-secondary">{{ t('misc.dbtools.copyDashboardsAndTemplatesDesc') }}</div>
        </div>
        <div class="grid gap-5 p-5">
          <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            <div class="grid gap-1.5">
              <span id="dash-source-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.sourceMaster') }}</span>
              <SelectRoot :model-value="store.dashSource.value" @update:model-value="store.dashSource.value = $event; onTargetChange('dash', 'source'); store.loadDashboards()">
                <SelectTrigger id="dash-source" aria-labelledby="dash-source-label">
                  <span :class="store.dashSource.value ? undefined : 'text-placeholder'">{{ targetOptionText(store.dashSource.value) }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <div class="grid gap-1.5">
              <span id="dash-target-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.targetMaster') }}</span>
              <SelectRoot :model-value="store.dashTarget.value" @update:model-value="store.dashTarget.value = $event; onTargetChange('dash', 'target')">
                <SelectTrigger id="dash-target" aria-labelledby="dash-target-label">
                  <span :class="store.dashTarget.value ? undefined : 'text-placeholder'">{{ targetOptionText(store.dashTarget.value) }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in store.targetOptions.value" :key="option.id" :value="option.id">{{ option.text }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <div class="grid gap-1.5">
              <span id="dash-mode-label" class="text-sm font-bold text-secondary">{{ t('misc.dbtools.copyMode') }}</span>
              <SelectRoot v-model="store.dashMode.value">
                <SelectTrigger id="dash-mode" aria-labelledby="dash-mode-label">
                  <span>{{ store.dashMode.value === 'replace_all' ? t('misc.dbtools.replaceAllSelected') : t('misc.dbtools.addOnlyMissing') }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add_missing">{{ t('misc.dbtools.addOnlyMissing') }}</SelectItem>
                  <SelectItem value="replace_all">{{ t('misc.dbtools.replaceAllSelected') }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
          </div>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            <SelectList
              id="dash-list"
              :rows="stringRows(store.dashboards.value, 'misc.dbtools.loadingDashboards')"
              :selected="store.dashSelected.value"
              @toggle="(value, selected) => { toggleInList(store.dashSelected, value, selected); store.dashPreview.value = null; }"
              @set-all="(values) => { store.dashSelected.value = values; store.dashPreview.value = null; }"
            >
              <template #title><div class="text-sm font-extrabold text-primary">{{ t('misc.dbtools.dashboards') }}</div></template>
            </SelectList>
            <SelectList
              id="template-list"
              :rows="stringRows(store.templates.value, 'misc.dbtools.loadingTemplates')"
              :selected="store.templateSelected.value"
              @toggle="(value, selected) => { toggleInList(store.templateSelected, value, selected); store.dashPreview.value = null; }"
              @set-all="(values) => { store.templateSelected.value = values; store.dashPreview.value = null; }"
            >
              <template #title><div class="text-sm font-extrabold text-primary">{{ t('misc.dbtools.templates') }}</div></template>
            </SelectList>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" id="dash-refresh" @click="store.loadDashboards()">{{ t('misc.dbtools.refreshSourceItems') }}</Button>
            <Button type="button" variant="primary" id="dash-preview" @click="store.previewCopyDashboards()">{{ t('misc.dbtools.preview') }}</Button>
            <Button type="button" variant="warning" id="dash-run" :disabled="!store.dashPreview.value" @click="store.runCopyDashboards()">{{ t('misc.dbtools.copyDashboards') }}</Button>
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

<style>
/* Root overflow rule ported from styles/db-tools.css (html/body carry no
   scope attribute — unscoped block). */
body {
  overflow: hidden;
}
</style>

<style scoped>
/* Page-level AppShell overrides — ported from styles/db-tools.css. */
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
