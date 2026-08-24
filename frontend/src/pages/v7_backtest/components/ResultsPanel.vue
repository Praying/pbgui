<script setup lang="ts">
/**
 * ResultsPanel — the results view chrome (:834-869): the sticky toolbar
 * (version/config/text filters, count label :5493-5503, select-all /
 * deselect / pin :6415-6419), the list wrap + resize handle (:853-858),
 * the inline compare area (:862-863) and the charts area (:865), plus
 * deleteSelectedResults' confirm flow (:8509-8532). Takes the results
 * store as its single prop — App owns the store.
 */
import { PhPushPin } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import CompareModal from './CompareModal.vue';
import ResultCharts from './ResultCharts.vue';
import ResultsTable from './ResultsTable.vue';
import { modalBackdropClass, modalBoxClass, modalBtnClass } from '../lib/uiClasses';
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
  <!-- results-panel-root must not generate a box: in the legacy page
       #results-fixed-top and #results-scroll-area were direct children of
       the #panel-results flex column, so #results-scroll-area's flex:1
       made it fill + scroll. A wrapping <div> here would sit between them,
       collapse the flex chain and clip the charts with no scrollbar. -->
  <div class="results-panel-root contents">
    <div id="results-fixed-top" class="mb-3 border-b-2 border-border-default bg-page pb-2 shadow-[0_4px_12px_rgba(5,8,14,0.6)]">
      <div id="results-toolbar" class="mb-3 flex flex-wrap items-center gap-2 pt-2">
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
        <span id="results-count-label" class="whitespace-nowrap text-sm text-secondary">{{ countLabel }}</span>
        <span style="flex: 1"></span>
        <button type="button" class="act-btn" data-test="results-select-all" :title="t('v7backtest.selectAllVisible')" @click="selectAllVisible">{{ t('v7backtest.selectAll') }}</button>
        <button type="button" class="act-btn" data-test="results-deselect" :title="t('v7backtest.deselectAll')" @click="store.deselectAll()">{{ t('v7backtest.deselect') }}</button>
        <button
          id="results-pin-btn"
          type="button"
          class="act-btn"
          :class="pinned ? '' : 'unpinned opacity-40'"
          :title="t('v7backtest.pinTable')"
          :aria-label="t('v7backtest.pinTable')"
          style="font-size: 15px; padding: 0 6px"
          @click="pinned = !pinned"
        >
          <PbIcon :icon="PhPushPin" :size="18" />
        </button>
      </div>
      <div id="results-list-wrap" class="relative h-[25vh] min-h-20 overflow-y-auto rounded-sm border border-border-default" :style="wrapHeight !== null ? { height: wrapHeight + 'px' } : undefined">
        <div id="results-list">
          <div v-if="store.checking.value" class="empty-state px-5 py-15 text-center text-md text-secondary">{{ t('v7backtest.checkingForResults') }}</div>
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
      <div id="results-resize-handle" class="flex h-1.5 cursor-row-resize select-none items-center justify-center rounded-b-sm bg-border-default" :title="t('v7backtest.dragToResize')" @mousedown="onResizeStart">
        <span class="h-0.5 w-8 rounded-[2px] bg-secondary opacity-50"></span>
      </div>
    </div>

    <div id="results-scroll-area" class="min-h-0 flex-1 overflow-y-auto pb-5">
      <CompareModal :open="store.compareOpen.value" :traces="compareTraces" :layout="compareLayout" />
      <ResultCharts :sections="store.activeResults.value" :version="store.version" :data-api="store.dataApi" />
    </div>

    <div v-if="deleteConfirmOpen" id="modal-root" :class="modalBackdropClass" data-test="results-delete-modal">
      <div :class="modalBoxClass">
        <h3>{{ t('v7backtest.deleteResults') }}</h3>
        <p>{{ t('v7backtest.deleteResultsConfirm', { n: store.getSelected().length }) }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" :class="modalBtnClass()" @click="deleteConfirmOpen = false">{{ t('common.cancel') }}</button>
          <button type="button" :class="modalBtnClass('danger')" data-test="results-delete-confirm" @click="confirmDelete">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
