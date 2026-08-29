<script setup lang="ts">
/**
 * LegacyPanel — the legacy results view's DOM port (:918-945): the
 * toolbar (config filter + text search :922-926, select-all/deselect/
 * pin :928-930), the 25vh wrap + resize handle (:932-938), the compare
 * area (:941), the charts host (:942) and deleteSelectedLegacyResults'
 * confirm flow (:6364-6380). v7-only — App never mounts it on v8.
 */
import { PhPushPin } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
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
  <div id="panel-legacy" class="view-panel min-h-0 flex-1 flex-col overflow-hidden" :class="[active ? 'flex' : 'hidden', { active, 'leg-unpinned': !pinned }]">
    <div id="legacy-results-view" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div id="legacy-results-fixed-top" class="mb-3 border-b-2 border-border-default bg-page pb-2 shadow-[var(--shadow-panel)]">
        <div id="legacy-results-toolbar" class="mb-3 mt-2 flex flex-wrap items-center gap-2">
          <span id="legacy-results-config-filter-label" style="font-size: var(--fs-sm); color: var(--text-dim)">{{ t('v7backtest.config') }}</span>
          <!-- ui-migration: the legacy <option value="">All configs</option> has no
               reka equivalent — the listbox offers no reset row; the cleared model
               ('' = all configs) renders as the trigger label instead. -->
          <SelectRoot v-model="store.configFilter.value">
            <SelectTrigger id="legacy-results-config-filter" class="w-auto min-w-[100px] max-w-[200px]" aria-labelledby="legacy-results-config-filter-label">
              <span>{{ store.configFilter.value || t('v7backtest.allConfigs') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="name in store.configOptions.value" :key="name" :value="name">{{ name }}</SelectItem>
            </SelectContent>
          </SelectRoot>
          <Input id="legacy-results-filter" v-model="store.textFilter.value" type="text" class="w-auto max-w-[200px]" :placeholder="t('v7backtest.searchName')" />
          <span style="flex: 1"></span>
          <Button type="button" variant="default" class="act-btn h-auto" data-test="legacy-select-all" :title="t('v7backtest.selectAllVisible')" @click="store.selectAll(store.visible.value.map((row) => row.path))">
            {{ t('v7backtest.selectAll') }}
          </Button>
          <Button type="button" variant="default" class="act-btn h-auto" data-test="legacy-deselect" :title="t('v7backtest.deselectAll')" @click="store.deselectAll()">{{ t('v7backtest.deselect') }}</Button>
          <Button
            id="legacy-results-pin-btn"
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
        <div id="legacy-results-list-wrap" class="relative h-[25vh] min-h-20 overflow-y-auto rounded-sm border border-border-default" :style="wrapHeight !== null ? { height: wrapHeight + 'px' } : undefined">
          <div id="legacy-results-table">
            <div v-if="store.visible.value.length === 0" class="empty-state px-5 py-15 text-center text-md text-secondary">{{ t('v7backtest.noLegacyResults') }}</div>
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
        <div id="legacy-results-resize-handle" class="flex h-1.5 cursor-row-resize select-none items-center justify-center rounded-b-sm bg-border-default" :title="t('v7backtest.dragToResize')" @mousedown="onResizeStart">
          <span class="h-0.5 w-8 rounded-[2px] bg-secondary opacity-50"></span>
        </div>
      </div>
      <div id="legacy-results-scroll" class="min-h-0 flex-1 overflow-y-auto pb-5">
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
