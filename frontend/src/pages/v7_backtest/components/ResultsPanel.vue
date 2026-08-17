<script setup lang="ts">
/**
 * ResultsPanel — the results view chrome (:834-869): the sticky toolbar
 * (version/config/text filters, count label :5493-5503, select-all /
 * deselect / pin :6415-6419), the list wrap + resize handle (:853-858),
 * the inline compare area (:862-863) and the charts area (:865), plus
 * deleteSelectedResults' confirm flow (:8509-8532). Takes the results
 * store as its single prop — App owns the store.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import CompareModal from './CompareModal.vue';
import ResultCharts from './ResultCharts.vue';
import ResultsTable from './ResultsTable.vue';
import type { ResultsStore } from '../composables/useResults';
import type { PlotlyLayout, PlotlyTrace } from '../lib/plotlyVendor';
import type { ResultActionKind } from '../types';

const props = defineProps<{
  results: ResultsStore;
  /** updateVersionBoundResultActions (:5349-5355) — the ctx-bar gate. */
  versionBoundActions?: boolean;
}>();

const { t } = useI18n();
const store = props.results;

/** Pin state (:6415-6419) — the `unpinned` class lands on #panel-results in App. */
const pinned = defineModel<boolean>('pinned', { default: true });
const deleteConfirmOpen = ref(false);

const countLabel = computed<string>(() => {
  const total = store.results.value.filter((row) => store.versionFilter.value === 'both' || row.backtest_version === store.versionFilter.value).length;
  const shown = store.visible.value.length;
  return shown === total
    ? `${shown} ${t('v7backtest.resultsCount', { n: shown })}`
    : `${t('v7backtest.showingResultsOf', { shown, total })} ${t('v7backtest.resultsCount', { n: total })}`;
});

const compareTraces = computed<PlotlyTrace[]>(() => store.compareTraces.value as PlotlyTrace[]);
const compareLayout = computed<PlotlyLayout>(() => store.compareLayout.value as PlotlyLayout);

function onSort(column: string): void {
  store.setSortColumn(column);
}

function onToggleSelect(path: string): void {
  store.toggleSelected(path);
}

function onSelectPaths(paths: string[], selected: boolean): void {
  const next = new Set(store.selectedPaths.value);
  for (const path of paths) {
    if (selected) next.add(path);
    else next.delete(path);
  }
  store.setSelected([...next]);
}

function onToggleAction(path: string, kind: ResultActionKind): void {
  store.toggleAction(path, kind);
}

function selectAllVisible(): void {
  store.selectAll(store.visible.value.map((row) => row.path));
}

/** The wrap height drag (:856-858 resize handle). */
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

/* ── deleteSelectedResults (:8509-8532) — App's ctx-bar target ── */

function deleteSelectedFlow(): void {
  if (store.getSelected().length === 0) {
    store.notifyError(t('v7backtest.nothingSelected'));
    return;
  }
  deleteConfirmOpen.value = true;
}

async function confirmDelete(): Promise<void> {
  deleteConfirmOpen.value = false;
  await store.deleteResults(store.getSelected());
}

defineExpose({ deleteSelectedFlow });
</script>

<template>
  <div>
    <div id="results-fixed-top">
      <div id="results-toolbar">
        <label style="font-size: var(--fs-sm); color: var(--text-dim)">{{ t('v7backtest.version') }}</label>
        <select
          id="results-version-filter"
          class="sb-input"
          style="max-width: 100px"
          :value="store.versionFilter.value"
          @change="store.setVersionFilter(($event.target as HTMLSelectElement).value as 'v7' | 'v8' | 'both')"
        >
          <option value="v7">PBv7</option>
          <option value="v8">PBv8</option>
          <option value="both">{{ t('v7backtest.both') }}</option>
        </select>
        <label style="font-size: var(--fs-sm); color: var(--text-dim)">{{ t('v7backtest.config') }}</label>
        <select id="results-config-filter" v-model="store.configFilter.value" class="sb-input" style="max-width: 200px">
          <option value="">{{ t('v7backtest.allConfigs') }}</option>
          <option v-for="name in store.configNames.value" :key="name" :value="name">{{ name }}</option>
        </select>
        <input id="results-filter" v-model="store.textFilter.value" type="text" class="sb-input" style="max-width: 200px" :placeholder="t('v7backtest.searchName')" />
        <span id="results-count-label" class="results-count-label">{{ countLabel }}</span>
        <span style="flex: 1"></span>
        <button type="button" class="act-btn" data-test="results-select-all" :title="t('v7backtest.selectAllVisible')" @click="selectAllVisible">{{ t('v7backtest.selectAll') }}</button>
        <button type="button" class="act-btn" data-test="results-deselect" :title="t('v7backtest.deselectAll')" @click="store.deselectAll()">{{ t('v7backtest.deselect') }}</button>
        <button id="results-pin-btn" type="button" class="act-btn" :class="{ unpinned: !pinned }" :title="t('v7backtest.pinTable')" style="font-size: 15px; padding: 0 6px" @click="pinned = !pinned">📌</button>
      </div>
      <div id="results-list-wrap" :style="wrapHeight !== null ? { height: wrapHeight + 'px' } : undefined">
        <div id="results-list">
          <div v-if="store.checking.value" class="empty-state">{{ t('v7backtest.checkingForResults') }}</div>
          <ResultsTable
            v-else
            :rows="store.visible.value"
            :selected="store.selectedPaths.value"
            :sort="store.sort.value"
            :active-actions="store.actionsByPath.value"
            @sort="onSort"
            @toggle-select="onToggleSelect"
            @select-paths="onSelectPaths"
            @toggle-action="onToggleAction"
          />
        </div>
      </div>
      <div id="results-resize-handle" :title="t('v7backtest.dragToResize')" @mousedown="onResizeStart">
        <span></span>
      </div>
    </div>

    <div id="results-scroll-area">
      <CompareModal :open="store.compareOpen.value" :traces="compareTraces" :layout="compareLayout" />
      <ResultCharts :sections="store.activeResults.value" :version="store.version" :data-api="store.dataApi" />
    </div>

    <div v-if="deleteConfirmOpen" id="modal-root" data-test="results-delete-modal">
      <div class="modal-box">
        <h3>{{ t('v7backtest.deleteResults') }}</h3>
        <p>{{ t('v7backtest.deleteResultsConfirm', { n: store.getSelected().length }) }}</p>
        <div class="modal-actions">
          <button type="button" class="modal-btn" @click="deleteConfirmOpen = false">{{ t('common.cancel') }}</button>
          <button type="button" class="modal-btn modal-btn-danger" data-test="results-delete-confirm" @click="confirmDelete">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
