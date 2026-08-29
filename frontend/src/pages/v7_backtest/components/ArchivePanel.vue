<script setup lang="ts">
/**
 * ArchivePanel — the archive view's DOM port (:875-917): the list view
 * (:8864-8888) and the results view (status line :882, mode tabs
 * :884-886, config/coin/text filters :887-895, count label :896,
 * select/deselect/pin :898-900, the 25vh wrap + resize handle
 * :902-908, compare area :911, charts :912) plus the archive-family
 * modal flows (add/delete archive, delete results, rename config,
 * remove-liquidated/-duplicates previews, score preview, optimize
 * view/import/delete). The flows are exposed for App's ctx sidebar.
 */
import { PhPushPin, PhTrash } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import ArchiveOptimizeTable from './ArchiveOptimizeTable.vue';
import ArchiveSchedulesTable from './ArchiveSchedulesTable.vue';
import ConfirmModal from './ConfirmModal.vue';
import CompareModal from './CompareModal.vue';
import ReadmePreview from './ReadmePreview.vue';
import RebacktestModal from './RebacktestModal.vue';
import ResultCharts from './ResultCharts.vue';
import ResultsTable from './ResultsTable.vue';
import RetestModal from './RetestModal.vue';
import { plainLegacyHtml, resultsCountLabel } from '../lib/archiveModel';
import { modalBackdropClass, modalBoxClass } from '../lib/uiClasses';
import { archiveRemoteBrowserUrl } from '../lib/readmePreview';
import type { PlotlyLayout, PlotlyTrace } from '../lib/plotlyVendor';
import type { ArchiveCleanupItem, ArchiveOptimizeConfigItem, ArchiveSummary, ResultActionKind } from '../types';
import type { ArchiveStore } from '../composables/useArchive';
import type { ResultDataApi, ResultsSection } from '../composables/useResults';

const props = defineProps<{
  archive: ArchiveStore;
  active: boolean;
  /** The page flavor — seeds the hard-stop chart spec like the results panel. */
  version: 'v7' | 'v8';
}>();

const { t } = useI18n();
const store = props.archive;

const pinned = defineModel<boolean>('pinned', { default: true });

/* ── derived ── */

const isBacktests = computed(() => store.mode.value === 'backtests');
const isOptimize = computed(() => store.mode.value === 'optimize');
const countLabel = computed(() => resultsCountLabel(store.visible.value.length, store.results.value.length, t));
const textPlaceholder = computed(() =>
  store.mode.value === 'backtests' ? t('v7backtest.searchName') : store.mode.value === 'schedules' ? t('v7backtest.searchSchedule') : t('v7backtest.searchOptimize')
);
const sections = computed<ResultsSection[]>(() => {
  const sections: ResultsSection[] = [];
  for (const result of store.visible.value) {
    const actions = store.actionsByPath.value[result.path];
    if (actions && actions.size > 0) sections.push({ result, actions });
  }
  return sections;
});
const compareTraces = computed(() => store.compareTraces.value as PlotlyTrace[]);
const compareLayout = computed(() => store.compareLayout.value as PlotlyLayout);
const scoreReadme = computed(() => store.scorePreview.value?.payload.readme_markdown ?? store.scorePreview.value?.payload.markdown ?? '');
const remoteBase = computed(() => {
  const archive = store.archives.value.find((entry: ArchiveSummary) => entry.name === store.selectedName.value);
  return archiveRemoteBrowserUrl(archive?.url ?? '');
});

/* ── the wrap height drag (:905-908) ── */

const wrapHeight = ref<number | null>(null);

function onResizeStart(event: MouseEvent): void {
  if (event.button !== 0) return;
  const startY = event.clientY;
  const startHeight = wrapHeight.value ?? 200;
  function onMove(move: MouseEvent): void {
    wrapHeight.value = Math.max(80, startHeight + move.clientY - startY);
  }
  function onUp(): void {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  event.preventDefault();
}

/* ── selection + sorting (:5873-6047, :5467-5477) ── */

function onSelectPaths(paths: string[], selected: boolean): void {
  const next = new Set(store.selectedPaths.value);
  for (const path of paths) {
    if (selected) next.add(path);
    else next.delete(path);
  }
  store.setSelected([...next]);
}

function selectAllVisible(): void {
  store.selectAll(store.visible.value.map((row) => row.path));
}

function onToggleAction(path: string, kind: ResultActionKind): void {
  store.toggleAction(path, kind);
}

/* ── modal flows (legacy showModal equivalents) ── */

const addOpen = ref(false);
const addName = ref('');
const addUrl = ref('');

function openAddArchive(): void {
  addName.value = '';
  addUrl.value = '';
  addOpen.value = true;
}

async function confirmAddArchive(): Promise<void> {
  const name = addName.value.trim();
  const url = addUrl.value.trim();
  if (!name || !url) {
    store.notifyError(t('v7backtest.nameAndUrlRequired'));
    return;
  }
  addOpen.value = false;
  await store.addArchive(name, url);
}

const deleteArchiveTarget = ref<string | null>(null);

async function confirmDeleteArchive(): Promise<void> {
  const name = deleteArchiveTarget.value;
  deleteArchiveTarget.value = null;
  if (name !== null) await store.deleteArchive(name);
}

const deleteResultsOpen = ref(false);

function openDeleteResults(): void {
  if (store.getSelected().length === 0) {
    store.notifyError(t('v7backtest.nothingSelected'));
    return;
  }
  deleteResultsOpen.value = true;
}

async function confirmDeleteResults(): Promise<void> {
  deleteResultsOpen.value = false;
  await store.deleteSelected();
}

const renameOpen = ref(false);
const renameValue = ref('');
const renamePath = ref('');

function openRename(): void {
  if (!store.isOwn.value) {
    store.notifyError(t('v7backtest.renameOwnOnly'));
    return;
  }
  const selected = store.getSelected();
  if (selected.length !== 1) {
    store.notifyError(t('v7backtest.selectOneRename'));
    return;
  }
  const item = store.results.value.find((row) => row.path === selected[0]);
  if (!item) {
    store.notifyError(t('v7backtest.selectedNoLongerVisible'));
    return;
  }
  renamePath.value = item.path;
  renameValue.value = item.config_name || '';
  renameOpen.value = true;
}

async function confirmRename(): Promise<void> {
  const newName = renameValue.value.trim();
  if (!newName) {
    store.notifyError(t('v7backtest.newNameRequired'));
    return;
  }
  renameOpen.value = false;
  await store.renameConfig(renamePath.value, newName);
}

interface CleanupFlow {
  open: boolean;
  items: ArchiveCleanupItem[];
  paths: string[];
  scope: 'selected_results' | 'visible_results';
  kind: 'liquidated' | 'duplicates';
}

const cleanup = ref<CleanupFlow>({ open: false, items: [], paths: [], scope: 'selected_results', kind: 'liquidated' });

async function openCleanup(kind: 'liquidated' | 'duplicates'): Promise<void> {
  if (!store.isOwn.value) {
    store.notifyError(t(kind === 'liquidated' ? 'v7backtest.liquidatedOwnOnly' : 'v7backtest.duplicateOwnOnly'));
    return;
  }
  const selected = store.getSelected();
  const paths = selected.length > 0 ? selected : store.visiblePaths.value.slice();
  if (paths.length === 0) {
    store.notifyError(t('v7backtest.noVisibleArchiveResults'));
    return;
  }
  const scope = selected.length > 0 ? 'selected_results' : 'visible_results';
  const items = kind === 'liquidated' ? await store.previewRemoveLiquidated(paths, scope) : await store.previewRemoveDuplicates(paths, scope);
  if (items.length === 0) return; // the store already toasted the none-found case
  cleanup.value = { open: true, items, paths, scope, kind };
}

async function confirmCleanup(): Promise<void> {
  const flow = cleanup.value;
  cleanup.value = { ...flow, open: false };
  if (flow.kind === 'liquidated') await store.applyRemoveLiquidated(flow.paths, flow.scope);
  else await store.applyRemoveDuplicates(flow.paths, flow.scope);
}

const importNameOpen = ref(false);
const importNameValue = ref('');
const importTarget = ref<{ path: string; name: string; version: string } | null>(null);

function selectedOptimizeItem(): { path: string; name: string; optimize_version?: string } | null {
  const selection = store.selectedOptimize.value;
  if (!selection) {
    store.notifyError(t('v7backtest.selectOptimizeConfigFirst'));
    return null;
  }
  return { path: selection.path, name: selection.name, optimize_version: selection.version };
}

async function openViewOptimize(): Promise<void> {
  const item = selectedOptimizeItem();
  if (!item) return;
  await store.viewOptimizeConfig(item.path, item.optimize_version ?? 'v7', item.name ?? '');
}

function openImportOptimize(): void {
  const item = selectedOptimizeItem();
  if (!item) return;
  importTarget.value = { path: item.path, name: item.name, version: item.optimize_version ?? 'v7' };
  importNameValue.value = item.name || (String(item.path).split('/').pop()?.replace(/\.json$/, '') ?? '');
  importNameOpen.value = true;
}

async function confirmImportOptimize(): Promise<void> {
  const target = importTarget.value;
  importNameOpen.value = false;
  if (!target) return;
  const data = await store.importOptimizeConfig(target.path, importNameValue.value || target.name, target.version);
  if (data) store.notifyOk(t('v7backtest.optimizeImportedAs', { name: data.name ?? importNameValue.value }));
}

const deleteOptimizeOpen = ref(false);

function openDeleteOptimize(): void {
  if (!store.isOwn.value) {
    store.notifyError(t('v7backtest.optimizeDeleteOwnOnly'));
    return;
  }
  const item = selectedOptimizeItem();
  if (!item) return;
  deleteOptimizeOpen.value = true;
}

async function confirmDeleteOptimize(): Promise<void> {
  const item = store.selectedOptimize.value;
  deleteOptimizeOpen.value = false;
  if (!item) return;
  await store.deleteOptimizeConfig(item.path, item.name, item.version);
}

async function openOptimizeFromConfig(): Promise<void> {
  const item = selectedOptimizeItem();
  if (!item) return;
  await store.optimizeFromConfig(item.path, item.name, item.optimize_version ?? 'v7');
}

function onOptimizeSelect(item: ArchiveOptimizeConfigItem): void {
  // single selection: a click replaces the current row (:9262 keeps one)
  store.selectedOptimize.value = { path: item.path, name: item.name ?? '', version: item.optimize_version ?? 'v7' };
}

function onRetestQueueNow(fields: Parameters<typeof store.confirmRetestReplace>[0]): void {
  store.retestOpen.value = false;
  void store.confirmRetestReplace(fields);
}

function onRetestSchedule(fields: Parameters<typeof store.confirmRetestSchedule>[0], schedule: { cadence: string; time: string; weekday: number }): void {
  store.retestOpen.value = false;
  void store.confirmRetestSchedule(fields, schedule);
}

function onRebacktestConfirm(fields: Parameters<typeof store.confirmRebacktest>[0]): void {
  store.rebacktestOpen.value = false;
  void store.confirmRebacktest(fields);
}

async function onOptimizeOpen(item: ArchiveOptimizeConfigItem): Promise<void> {
  store.selectedOptimize.value = { path: item.path, name: item.name ?? '', version: item.optimize_version ?? 'v7' };
  await store.viewOptimizeConfig(item.path, item.optimize_version ?? 'v7', item.name);
}

function cleanupPath(path: string | undefined): string {
  return String(path ?? '').split('/').slice(-3).join('/');
}

defineExpose({
  openAddArchive,
  openDeleteResults,
  openRename,
  openCleanup,
  openViewOptimize,
  openImportOptimize,
  openDeleteOptimize,
  openOptimizeFromConfig,
  viewArchive: (name: string) => void store.viewArchive(name),
  closeArchive: () => store.closeArchive(),
  refreshList: () => void store.loadArchives(),
});
</script>

<template>
  <div id="panel-archive" class="view-panel min-h-0 flex-1 flex-col overflow-hidden" :class="[active ? 'flex' : 'hidden', { active, 'arc-unpinned': !pinned }]">
    <!-- list view (:876-878) -->
    <div v-if="!store.selectedName.value" id="archive-list-view" class="min-h-0 flex-1 overflow-y-auto">
      <div id="archive-list-container">
        <div v-if="store.archives.value.length === 0" class="empty-state px-5 py-15 text-center text-md text-secondary" data-test="archive-empty">
          <div class="mb-3 text-[48px] opacity-40">🗄️</div>
          <span style="white-space: pre-line">{{ plainLegacyHtml(t('v7backtest.emptyArchivesHtml')) }}</span>
        </div>
        <table v-else class="tbl">
          <thead>
            <tr>
              <th>{{ t('v7backtest.name') }}</th>
              <th>URL</th>
              <th>{{ t('v7backtest.backtests') }}</th>
              <th>{{ t('v7backtest.optimize') }}</th>
              <th>{{ t('v7backtest.layout') }}</th>
              <th>{{ t('v7backtest.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in store.archives.value"
              :key="entry.name"
              :class="{ selected: entry.name === store.selectedName.value }"
              style="cursor: pointer"
              @dblclick="store.viewArchive(entry.name)"
            >
              <td style="font-weight: 600">{{ entry.name }}</td>
              <td style="font-size: var(--fs-xs); color: var(--text-dim); word-break: break-all">{{ entry.url ?? '' }}</td>
              <td>{{ entry.results ?? entry.configs ?? 0 }}</td>
              <td>{{ entry.optimize_configs ?? 0 }}</td>
              <td class="text-secondary">{{ entry.migration_status?.label ?? '' }}</td>
              <td class="actions-cell" @click.stop>
                <Button type="button" variant="danger" class="act-btn act-btn-danger h-auto" :title="t('v7backtest.delete')" :aria-label="t('v7backtest.delete')" @click="deleteArchiveTarget = entry.name"><PbIcon :icon="PhTrash" :size="18" /></Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- results view (:879-913) -->
    <div v-else id="archive-results-view" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div id="archive-results-fixed-top" class="mb-3 border-b-2 border-border-default bg-page pb-2 shadow-[var(--shadow-panel)]">
        <div id="archive-layout-status" class="pt-2 text-sm text-secondary" data-test="archive-layout-status">{{ store.statusLine.value }}</div>
        <div id="archive-results-toolbar" class="mb-3 flex flex-wrap items-center gap-2 pt-2">
          <Button type="button" variant="default" class="act-btn h-auto" data-test="arc-tab-backtests" :style="{ opacity: isBacktests ? '1' : '.55' }" @click="store.setMode('backtests')">
            {{ t('v7backtest.backtestResults') }}
          </Button>
          <Button type="button" variant="default" class="act-btn h-auto" data-test="arc-tab-optimize" :style="{ opacity: isOptimize ? '1' : '.55' }" @click="store.setMode('optimize')">
            {{ t('v7backtest.optimizeSettings') }}
          </Button>
          <Button
            type="button"
            variant="default"
            class="act-btn h-auto"
            data-test="arc-tab-schedules"
            :style="{ display: store.isOwn.value ? '' : 'none', opacity: store.mode.value === 'schedules' ? '1' : '.55' }"
            @click="store.setMode('schedules')"
          >
            {{ t('v7backtest.retestSchedules') }}
          </Button>
          <span v-show="isBacktests" id="arc-results-config-filter-label" style="font-size: var(--fs-sm); color: var(--text-dim)">{{ t('v7backtest.config') }}</span>
          <!-- ui-migration: the legacy <option value="">All configs/All coins</option>
               rows have no reka equivalent — the listboxes offer no reset row;
               the cleared model ('') renders as the trigger label instead. -->
          <SelectRoot v-model="store.configFilter.value">
            <SelectTrigger v-show="isBacktests" id="arc-results-config-filter" class="w-auto min-w-[100px] max-w-[200px]" aria-labelledby="arc-results-config-filter-label">
              <span>{{ store.configFilter.value || t('v7backtest.allConfigs') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="name in store.configOptions.value" :key="name" :value="name">{{ name }}</SelectItem>
            </SelectContent>
          </SelectRoot>
          <span v-show="isBacktests" id="arc-results-coin-label" style="font-size: var(--fs-sm); color: var(--text-dim)">{{ t('v7backtest.coinLabel') }}</span>
          <SelectRoot v-model="store.coinFilter.value">
            <SelectTrigger v-show="isBacktests" id="arc-results-coin-filter" class="w-auto min-w-[100px] max-w-[160px]" aria-labelledby="arc-results-coin-label">
              <span>{{ store.coinFilter.value || t('v7backtest.allCoins') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="coin in store.coinOptions.value" :key="coin" :value="coin">{{ coin }}</SelectItem>
            </SelectContent>
          </SelectRoot>
          <Input v-show="isBacktests" id="arc-results-filter" v-model="store.textFilter.value" type="text" class="w-auto max-w-[200px]" :placeholder="textPlaceholder" />
          <span v-show="isBacktests" id="archive-results-count-label" class="whitespace-nowrap text-sm text-secondary">{{ countLabel }}</span>
          <span style="flex: 1"></span>
          <Button v-show="isBacktests" type="button" variant="default" class="act-btn h-auto" data-test="arc-btn-select-all" :title="t('v7backtest.selectAllVisible')" @click="selectAllVisible">
            {{ t('v7backtest.selectAll') }}
          </Button>
          <Button v-show="isBacktests" type="button" variant="default" class="act-btn h-auto" data-test="arc-btn-deselect" :title="t('v7backtest.deselectAll')" @click="store.deselectAll()">
            {{ t('v7backtest.deselect') }}
          </Button>
          <Button
            id="archive-results-pin-btn"
            type="button"
            variant="default"
            class="act-btn h-auto"
            :class="pinned ? '' : 'unpinned opacity-40'"
            :title="t('v7backtest.pinTable')"
            :aria-label="t('v7backtest.pinTable')"
            style="font-size: 15px; padding: 0 6px"
            @click="pinned = !pinned"
          >
            <PbIcon :icon="PhPushPin" :size="18" />
          </Button>
        </div>
        <div id="archive-results-list-wrap" class="relative h-[25vh] min-h-20 overflow-y-auto rounded-sm border border-border-default" :style="wrapHeight !== null ? { height: wrapHeight + 'px' } : undefined">
          <div id="archive-results-table">
            <ArchiveSchedulesTable v-if="store.mode.value === 'schedules'" :schedules="store.schedulesVisible.value" :own="store.isOwn.value" @run="store.runSchedule" @toggle="store.toggleSchedule" @remove="store.deleteSchedule" />
            <ArchiveOptimizeTable v-else-if="isOptimize" :configs="store.optimizeVisible.value" :selected="store.selectedOptimize.value" @select="onOptimizeSelect" @open="onOptimizeOpen" />
            <template v-else>
              <div v-if="store.visible.value.length === 0" class="empty-state px-5 py-15 text-center text-md text-secondary">{{ t('v7backtest.noResultsInArchive') }}</div>
              <ResultsTable
                v-else
                :rows="store.visible.value"
                :selected="store.selectedPaths.value"
                :sort="store.sort.value"
                :active-actions="store.actionsByPath.value"
                wrap-id="#archive-results-list-wrap"
                @sort="store.setSortColumn"
                @toggle-select="store.toggleSelected"
                @select-paths="onSelectPaths"
                @toggle-action="onToggleAction"
              />
            </template>
          </div>
        </div>
        <div id="archive-results-resize-handle" class="flex h-1.5 cursor-row-resize select-none items-center justify-center rounded-b-sm bg-border-default" :title="t('v7backtest.dragToResize')" @mousedown="onResizeStart">
          <span class="h-0.5 w-8 rounded-[2px] bg-secondary opacity-50"></span>
        </div>
      </div>
      <div id="archive-results-scroll" class="min-h-0 flex-1 overflow-y-auto pb-5">
        <CompareModal area-id="archive-compare-chart-area" plot-id="arc-compare-chart-div" :open="store.compareOpen.value" :traces="compareTraces" :layout="compareLayout" />
        <ResultCharts charts-id="archive-charts" :sections="sections" :version="version" :data-api="store.dataApi as ResultDataApi" />
      </div>
    </div>

    <!-- modals -->
    <div v-if="addOpen" id="modal-root" :class="modalBackdropClass" data-test="add-archive-modal">
      <div :class="modalBoxClass">
        <h3>{{ t('v7backtest.addArchiveModal') }}</h3>
        <div class="min-h-0 flex-1 overflow-auto">
          <div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.archiveName') }}</div>
          <Input v-model="addName" placeholder="my_archive" data-test="arc-name" />
          <div class="mt-2 text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.gitUrl') }}</div>
          <Input v-model="addUrl" placeholder="https://github.com/..." data-test="arc-url" />
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button type="button" variant="default" class="modal-btn" @click="addOpen = false">{{ t('common.cancel') }}</Button>
          <Button type="button" variant="primary" class="modal-btn" data-test="arc-clone" @click="confirmAddArchive">{{ t('v7backtest.clone') }}</Button>
        </div>
      </div>
    </div>

    <ConfirmModal :open="deleteArchiveTarget !== null" :title="t('v7backtest.deleteArchive')" :confirm-label="t('common.delete')" danger test-id="delete-archive-modal" @confirm="confirmDeleteArchive" @cancel="deleteArchiveTarget = null">
      <p style="white-space: pre-line">{{ plainLegacyHtml(t('v7backtest.deleteArchiveConfirm', { name: deleteArchiveTarget ?? '' })) }}</p>
    </ConfirmModal>

    <ConfirmModal :open="deleteResultsOpen" :title="t('v7backtest.deleteArchiveResults')" :confirm-label="t('common.delete')" danger test-id="delete-archive-results-modal" @confirm="confirmDeleteResults" @cancel="deleteResultsOpen = false">
      <p style="white-space: pre-line">{{ plainLegacyHtml(t('v7backtest.deleteArchiveResultsConfirm', { n: store.getSelected().length, archive: store.selectedName.value })) }}</p>
    </ConfirmModal>

    <div v-if="renameOpen" id="modal-root" :class="modalBackdropClass" data-test="rename-modal">
      <div :class="modalBoxClass">
        <h3>{{ t('v7backtest.renameArchiveConfig') }}</h3>
        <div class="min-h-0 flex-1 overflow-auto">
          <p>Rename archive config <b>{{ renameValue }}</b>. All results in this config group will move to the new name.</p>
          <div class="form-group">
            <label>New name</label>
            <Input v-model="renameValue" data-test="rename-input" />
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button type="button" variant="default" class="modal-btn" @click="renameOpen = false">{{ t('common.cancel') }}</Button>
          <Button type="button" variant="primary" class="modal-btn" data-test="rename-ok" @click="confirmRename">{{ t('v7backtest.rename') }}</Button>
        </div>
      </div>
    </div>

    <ConfirmModal :open="cleanup.open" :title="t(cleanup.kind === 'liquidated' ? 'v7backtest.removeLiquidatedResults' : 'v7backtest.removeDuplicateResults')" :confirm-label="t('v7backtest.remove')" danger :test-id="`cleanup-${cleanup.kind}-modal`" @confirm="confirmCleanup" @cancel="cleanup = { ...cleanup, open: false }">
      <p>{{ plainLegacyHtml(t(cleanup.kind === 'liquidated' ? 'v7backtest.removeLiquidatedConfirm' : 'v7backtest.removeDuplicatesConfirm', { n: cleanup.items.length, archive: store.selectedName.value })) }}</p>
      <ul style="max-height: 40vh; overflow: auto">
        <li v-for="(item, i) in cleanup.items.slice(0, 20)" :key="i">
          {{ cleanupPath(item.path) }} <span class="text-secondary">{{ cleanup.kind === 'liquidated' ? item.reason : t('v7backtest.keeps', { name: cleanupPath(item.keep_path) }) }}</span>
        </li>
        <li v-if="cleanup.items.length > 20">{{ t('v7backtest.andMore', { n: cleanup.items.length - 20 }) }}</li>
      </ul>
    </ConfirmModal>

    <div v-if="store.scorePreview.value" id="modal-root" :class="modalBackdropClass" data-test="score-preview-modal">
      <div class="score-preview-modal" :class="modalBoxClass">
        <h3>{{ t('v7backtest.readmePreview', { name: store.selectedName.value }) }}</h3>
        <div class="min-h-0 flex-1 overflow-auto">
          <p class="text-secondary" style="margin: 0">
            {{ store.scorePreview.value.rebuilt ? 'Manifest and README were updated. This is the generated README.md preview.' : 'Read-only README.md preview. Git Push updates manifest and README automatically before committing.' }}
          </p>
          <div class="score-preview-meta" style="display: flex; gap: var(--sp-lg); margin: var(--sp-sm) 0">
            <div><div class="text-xs uppercase tracking-[0.5px] text-secondary">Score Version</div><b>{{ store.scorePreview.value.payload.score_version ?? '' }}</b></div>
            <div><div class="text-xs uppercase tracking-[0.5px] text-secondary">Results</div><b>{{ store.scorePreview.value.payload.scored ?? 0 }} / {{ store.scorePreview.value.payload.total ?? 0 }}</b></div>
            <div><div class="text-xs uppercase tracking-[0.5px] text-secondary">Generated</div><b>{{ store.scorePreview.value.payload.generated_at ?? '' }}</b></div>
          </div>
          <ReadmePreview :markdown="scoreReadme" :remote-base="remoteBase" />
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button type="button" variant="default" class="modal-btn" @click="store.scorePreview.value = null">{{ t('common.close') }}</Button>
          <Button v-if="store.isOwn.value" type="button" variant="primary" class="modal-btn" @click="store.rebuildScores()">{{ t('v7backtest.updateManifestReadme') }}</Button>
        </div>
      </div>
    </div>

    <div v-if="store.optimizeViewOpen.value" id="modal-root" :class="modalBackdropClass" data-test="optimize-view-modal">
      <div :class="modalBoxClass">
        <h3>{{ t('v7backtest.optimizeConfigPrefix', { name: store.selectedOptimize.value?.name ?? '' }) }}</h3>
        <div class="min-h-0 flex-1 overflow-auto"><pre class="json-pre" data-test="optimize-json">{{ JSON.stringify(store.optimizeConfigJson.value ?? {}, null, 2) }}</pre></div>
        <div class="mt-5 flex justify-end gap-2">
          <Button type="button" variant="default" class="modal-btn" @click="store.optimizeViewOpen.value = false">{{ t('common.close') }}</Button>
        </div>
      </div>
    </div>

    <div v-if="importNameOpen" id="modal-root" :class="modalBackdropClass" data-test="import-optimize-modal">
      <div :class="modalBoxClass">
        <h3>{{ t('v7backtest.importOptimizeConfig') }}</h3>
        <div class="min-h-0 flex-1 overflow-auto">
          <div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.importAs') }}</div>
          <Input v-model="importNameValue" data-test="import-name" />
          <p class="text-secondary">{{ t('v7backtest.importOverwriteHint') }}</p>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button type="button" variant="default" class="modal-btn" @click="importNameOpen = false">{{ t('common.cancel') }}</Button>
          <Button type="button" variant="primary" class="modal-btn" data-test="import-ok" @click="confirmImportOptimize">{{ t('v7backtest.importShort') }}</Button>
        </div>
      </div>
    </div>

    <ConfirmModal :open="deleteOptimizeOpen" :title="t('v7backtest.deleteOptimizeConfig')" :confirm-label="t('common.delete')" danger test-id="delete-optimize-modal" @confirm="confirmDeleteOptimize" @cancel="deleteOptimizeOpen = false">
      <p>{{ plainLegacyHtml(t('v7backtest.deleteOptimizeConfigConfirm', { name: store.selectedOptimize.value?.name || store.selectedOptimize.value?.path, archive: store.selectedName.value })) }}</p>
    </ConfirmModal>

    <RetestModal
      :open="store.retestOpen.value"
      :defaults="store.retestDefaults.value"
      @queue-now="onRetestQueueNow"
      @create-schedule="onRetestSchedule"
      @close="store.retestOpen.value = false"
      @error="store.notifyError"
    />
    <RebacktestModal
      :open="store.rebacktestOpen.value"
      :defaults="store.rebacktestDefaults.value"
      @confirm="onRebacktestConfirm"
      @close="store.rebacktestOpen.value = false"
      @error="store.notifyError"
    />
  </div>
</template>
