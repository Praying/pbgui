<script setup lang="ts">
/**
 * LegacyPanel — the legacy results view's DOM port (:918-945): the
 * toolbar (config filter + text search :922-926, select-all/deselect/
 * pin :928-930), the 25vh wrap + resize handle (:932-938), the compare
 * area (:941), the charts host (:942) and deleteSelectedLegacyResults'
 * confirm flow (:6364-6380). v7-only — App never mounts it on v8.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import CompareModal from './CompareModal.vue';
import ConfirmModal from './ConfirmModal.vue';
import RebacktestModal from './RebacktestModal.vue';
import ResultCharts from './ResultCharts.vue';
import ResultsTable from './ResultsTable.vue';
import type { PlotlyLayout, PlotlyTrace } from '../lib/plotlyVendor';
import type { LegacyResultsStore } from '../composables/useLegacyResults';
import type { ResultsSection } from '../composables/useResults';

const props = defineProps<{
  legacy: LegacyResultsStore;
  active: boolean;
}>();

const { t } = useI18n();
const store = props.legacy;

const pinned = defineModel<boolean>('pinned', { default: true });
const deleteOpen = ref(false);

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

function onSelectPaths(paths: string[], selected: boolean): void {
  const next = new Set(store.selectedPaths.value);
  for (const path of paths) {
    if (selected) next.add(path);
    else next.delete(path);
  }
  store.selectedPaths.value = next;
}

function openDelete(): void {
  if (store.getSelected().length === 0) {
    store.notifyError(t('v7backtest.nothingSelected'));
    return;
  }
  deleteOpen.value = true;
}

async function confirmDelete(): Promise<void> {
  deleteOpen.value = false;
  await store.deleteSelected();
}

/* the wrap height drag (:935-938) */
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

defineExpose({ openDelete, refresh: () => void store.loadLegacyResults() });
</script>

<template>
  <div id="panel-legacy" class="view-panel" :class="{ active, 'leg-unpinned': !pinned }">
    <div id="legacy-results-view">
      <div id="legacy-results-fixed-top">
        <div id="legacy-results-toolbar">
          <label style="font-size: var(--fs-sm); color: var(--text-dim)">{{ t('v7backtest.config') }}</label>
          <select id="legacy-results-config-filter" v-model="store.configFilter.value" class="sb-input" style="max-width: 200px">
            <option value="">{{ t('v7backtest.allConfigs') }}</option>
            <option v-for="name in store.configOptions.value" :key="name" :value="name">{{ name }}</option>
          </select>
          <input id="legacy-results-filter" v-model="store.textFilter.value" type="text" class="sb-input" style="max-width: 200px" :placeholder="t('v7backtest.searchName')" />
          <span style="flex: 1"></span>
          <button type="button" class="act-btn" data-test="legacy-select-all" :title="t('v7backtest.selectAllVisible')" @click="store.selectAll(store.visible.value.map((row) => row.path))">
            {{ t('v7backtest.selectAll') }}
          </button>
          <button type="button" class="act-btn" data-test="legacy-deselect" :title="t('v7backtest.deselectAll')" @click="store.deselectAll()">{{ t('v7backtest.deselect') }}</button>
          <button id="legacy-results-pin-btn" type="button" class="act-btn" :class="{ unpinned: !pinned }" :title="t('v7backtest.pinTable')" style="font-size: 15px; padding: 0 6px" @click="pinned = !pinned">📌</button>
        </div>
        <div id="legacy-results-list-wrap" :style="wrapHeight !== null ? { height: wrapHeight + 'px' } : undefined">
          <div id="legacy-results-table">
            <div v-if="store.visible.value.length === 0" class="empty-state">{{ t('v7backtest.noLegacyResults') }}</div>
            <ResultsTable
              v-else
              :rows="store.visible.value"
              :selected="store.selectedPaths.value"
              :sort="store.sort.value"
              :active-actions="store.actionsByPath.value"
              :show-version="false"
              :show-strategy="false"
              wrap-id="#legacy-results-list-wrap"
              @sort="store.setSortColumn"
              @toggle-select="store.toggleSelected"
              @select-paths="onSelectPaths"
              @toggle-action="store.toggleAction"
            />
          </div>
        </div>
        <div id="legacy-results-resize-handle" :title="t('v7backtest.dragToResize')" @mousedown="onResizeStart">
          <span></span>
        </div>
      </div>
      <div id="legacy-results-scroll">
        <CompareModal area-id="legacy-compare-chart-area" plot-id="legacy-compare-chart-div" :open="store.compareOpen.value" :traces="compareTraces" :layout="compareLayout" />
        <ResultCharts charts-id="legacy-charts" :sections="sections" version="v7" :data-api="store.dataApi" />
      </div>
    </div>

    <ConfirmModal :open="deleteOpen" :title="t('v7backtest.deleteLegacyResults')" :confirm-label="t('common.delete')" danger test-id="legacy-delete-modal" @confirm="confirmDelete" @cancel="deleteOpen = false">
      <p>{{ t('v7backtest.deleteLegacyResultsConfirm', { n: store.getSelected().length }) }}</p>
    </ConfirmModal>

    <RebacktestModal
      :open="store.rebacktestOpen.value"
      :defaults="store.rebacktestDefaults.value"
      @confirm="(fields) => { store.rebacktestOpen.value = false; void store.confirmRebacktest(fields); }"
      @close="store.rebacktestOpen.value = false"
      @error="store.notifyError"
    />
  </div>
</template>
