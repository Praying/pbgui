<script setup lang="ts">
/**
 * ResultsPanel — the results view chrome (:834-869): the sticky toolbar
 * (version/config/text filters, count label :5493-5503, select-all /
 * deselect / pin :6415-6419), the list wrap + resize handle (:853-858),
 * the inline compare area (:862-863) and the charts area (:865), plus
 * deleteSelectedResults' confirm flow (:8509-8532). Takes the results
 * store as its single prop — App owns the store.
 */
import { PhChartLineUp, PhMagnifyingGlass, PhPushPin } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import CompareModal from './CompareModal.vue';
import ResultCharts from './ResultCharts.vue';
import ResultsTable from './ResultsTable.vue';
import { modalBackdropClass, modalBoxClass } from '../lib/uiClasses';
import type { ResultsStore } from '../composables/useResults';
import type { PlotlyLayout, PlotlyTrace } from '../lib/plotlyVendor';
import type { ResultActionKind } from '../types';

const emit = defineEmits<{
  convert: [path: string];
}>();

const props = defineProps<{
  results: ResultsStore;
  /** updateVersionBoundResultActions (:5349-5355) — the ctx-bar gate. */
  versionBoundActions?: boolean;
  allowV8Convert?: boolean;
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
    ? t('v7backtest.resultsCount', { n: shown })
    : t('v7backtest.showingResultsOf', { shown, total });
});

const selectedCount = computed<number>(() => store.selectedPaths.value.size);

const compareTraces = computed<PlotlyTrace[]>(() => store.compareTraces.value as PlotlyTrace[]);
const compareLayout = computed<PlotlyLayout>(() => store.compareLayout.value as PlotlyLayout);

function onSort(column: string): void {
  store.setSortColumn(column);
}

function onToggleSelect(path: string): void {
  store.toggleSelected(path);
}

function onConvert(path: string): void {
  emit('convert', path);
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
    <div
      id="results-fixed-top"
      class="mb-4 overflow-hidden rounded-xl border border-secondary/14 bg-[radial-gradient(circle_at_100%_0%,rgb(var(--accent-rgb)/0.08),transparent_24rem),linear-gradient(145deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-page-rgb)/0.98))] shadow-panel"
    >
      <div class="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-secondary/12 px-4 py-3">
        <div class="flex min-w-0 items-center gap-3">
          <div class="grid size-8 shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent/8 text-accent-soft">
            <PbIcon :icon="PhChartLineUp" :size="18" />
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">{{ t('v7backtest.results') }}</div>
            <div id="results-count-label" class="mt-0.5 truncate text-sm font-semibold text-primary" aria-live="polite">{{ countLabel }}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums"
            :class="selectedCount > 0 ? 'border-accent/24 bg-accent/10 text-accent-soft' : 'border-secondary/12 bg-page/35 text-muted'"
            aria-live="polite"
          >
            {{ t('v7backtest.resultsSelected', { n: selectedCount }) }}
          </span>
          <Button
            id="results-pin-btn"
            type="button"
            variant="ghost"
            class="size-8 p-0 text-secondary hover:text-primary"
            :class="pinned ? 'border border-accent/20 bg-accent/8 text-accent-soft' : 'unpinned border border-secondary/12 opacity-55'"
            :title="t('v7backtest.pinTable')"
            :aria-label="t('v7backtest.pinTable')"
            :aria-pressed="pinned"
            @click="pinned = !pinned"
          >
            <PbIcon :icon="PhPushPin" :size="17" />
          </Button>
        </div>
      </div>

      <div id="results-toolbar" class="flex flex-wrap items-end gap-3 border-b border-secondary/12 bg-page/24 px-4 py-3">
        <label class="grid min-w-[112px] gap-1.5">
          <span id="results-version-filter-label" class="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{{ t('v7backtest.version') }}</span>
          <SelectRoot :model-value="store.versionFilter.value" @update:model-value="store.setVersionFilter(String($event ?? '') as 'v7' | 'v8' | 'both')">
            <SelectTrigger id="results-version-filter" class="w-full border-secondary/16 bg-page/68" aria-labelledby="results-version-filter-label">
              <span>{{ store.versionFilter.value === 'v7' ? 'PBv7' : store.versionFilter.value === 'v8' ? 'PBv8' : t('v7backtest.both') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="v7">PBv7</SelectItem>
              <SelectItem value="v8">PBv8</SelectItem>
              <SelectItem value="both">{{ t('v7backtest.both') }}</SelectItem>
            </SelectContent>
          </SelectRoot>
        </label>

        <label class="grid min-w-[180px] max-w-[260px] flex-1 gap-1.5">
          <span id="results-config-filter-label" class="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{{ t('v7backtest.config') }}</span>
          <!-- ui-migration: the legacy <option value="">All configs</option> has no
               reka equivalent — the cleared model ('' = all configs) renders as
               the trigger label instead. -->
          <SelectRoot v-model="store.configFilter.value">
            <SelectTrigger id="results-config-filter" class="w-full border-secondary/16 bg-page/68" aria-labelledby="results-config-filter-label">
              <span>{{ store.configFilter.value || t('v7backtest.allConfigs') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="name in store.configNames.value" :key="name" :value="name">{{ name }}</SelectItem>
            </SelectContent>
          </SelectRoot>
        </label>

        <label class="grid min-w-[220px] max-w-[360px] flex-[1.4] gap-1.5">
          <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{{ t('common.search') }}</span>
          <span class="relative block">
            <PbIcon :icon="PhMagnifyingGlass" :size="15" class="pointer-events-none absolute left-2.5 top-1/2 z-1 -translate-y-1/2 text-muted" />
            <Input id="results-filter" v-model="store.textFilter.value" type="search" class="w-full border-secondary/16 bg-page/68 pl-8" :placeholder="t('v7backtest.searchName')" />
          </span>
        </label>

        <div class="ml-auto flex items-center gap-2 pb-px">
          <Button type="button" variant="outline" size="sm" class="h-8 border-secondary/16 px-3" data-test="results-select-all" :title="t('v7backtest.selectAllVisible')" @click="selectAllVisible">{{ t('v7backtest.selectAll') }}</Button>
          <Button type="button" variant="ghost" size="sm" class="h-8 px-3 text-secondary" data-test="results-deselect" :title="t('v7backtest.deselectAll')" :disabled="selectedCount === 0" @click="store.deselectAll()">{{ t('v7backtest.deselect') }}</Button>
        </div>
      </div>

      <div id="results-list-wrap" class="relative h-[clamp(220px,34dvh,400px)] min-h-36 overflow-auto bg-page/45" :style="wrapHeight !== null ? { height: wrapHeight + 'px' } : undefined">
        <div id="results-list">
          <LoadingSkeleton v-if="store.checking.value" class="px-5 py-15" :label="t('v7backtest.checkingForResults')" />
          <ResultsTable
            v-else
            :rows="store.visible.value"
            :selected="store.selectedPaths.value"
            :sort="store.sort.value"
            :active-actions="store.actionsByPath.value"
            :allow-v8-convert="props.allowV8Convert"
            @sort="onSort"
            @convert="onConvert"
            @toggle-select="onToggleSelect"
            @select-paths="onSelectPaths"
            @toggle-action="onToggleAction"
          />
        </div>
      </div>
      <div id="results-resize-handle" class="flex h-2 cursor-row-resize select-none items-center justify-center border-t border-secondary/12 bg-page/55" :title="t('v7backtest.dragToResize')" @mousedown="onResizeStart">
        <span class="h-0.5 w-10 rounded-full bg-secondary/35"></span>
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
          <Button type="button" variant="default" class="modal-btn" @click="deleteConfirmOpen = false">{{ t('common.cancel') }}</Button>
          <Button type="button" variant="danger" class="modal-btn" data-test="results-delete-confirm" @click="confirmDelete">{{ t('common.delete') }}</Button>
        </div>
      </div>
    </div>
  </div>
</template>
