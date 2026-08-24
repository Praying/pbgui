<script setup lang="ts">
/**
 * Command Center stage — renderChampions (:2944-2973), renderInsights
 * (:2975-2990) and the Pareto Front Preview (:1248-1274 markup, :2890-2942
 * render) with the preview settings toggles (:4435-4444). The left summary
 * mirrors the full-load progress text while a scan is pending (:2453-2458).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ScatterChart from './ScatterChart.vue';
import { bestMatchText, championRows, insightRows, previewSummaries } from '../lib/viewModels';
import type { ParetoStore } from '../composables/useParetoSession';
import type { Surfaces } from '../composables/useSurfaces';
import type { ChartSpec } from '../types';

const props = defineProps<{
  store: ParetoStore;
  surfaces: Surfaces;
}>();

const { t } = useI18n();
const store = props.store;

const champions = computed(() => championRows(store.state.commandCenter, store.state.selectedConfigIndex, (key, params) => t(key, params ?? {})));
const insights = computed(() => insightRows(store.state.commandCenter));

const playgroundPayload = computed(() => store.state.playground.payload);
const preview = computed<ChartSpec | null>(() => (playgroundPayload.value?.visualizations?.preview?.pareto_analysis as ChartSpec | undefined) ?? null);
const robustness = computed<ChartSpec | null>(() => (playgroundPayload.value?.visualizations?.preview?.robustness as ChartSpec | undefined) ?? null);

const summaries = computed(() => previewSummaries(playgroundPayload.value, (key, params) => t(key, params ?? {})));
/** updateLoadStatusMirrors (:2453-2458) — the left line doubles as the scan readout. */
const leftSummary = computed(() =>
  store.state.fullLoadPending && store.progress.fullLoad.text ? store.progress.fullLoad.text : summaries.value.left
);

/* Variant → complete Tailwind colour set (the former .status-chip.good/
   .warn/.bad rules; the variant-less levels stayed untinted). Each branch
   keeps the legacy level anchor (good/warn/bad) the tests key off. */
const CHIP_BASE = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-[0.04em]';

function statusChipClass(levelClass: string): string {
  if (levelClass === 'good') return `good ${CHIP_BASE} bg-success/15 text-success`;
  if (levelClass === 'warn') return `warn ${CHIP_BASE} bg-warning/15 text-warning`;
  if (levelClass === 'bad') return `bad ${CHIP_BASE} bg-danger/15 text-danger`;
  return `info ${CHIP_BASE}`; // legacy had no .status-chip.info tint — layout only
}

/** The .champion-item/.active pair — complete independent colour sets. */
function championItemClass(active: boolean): string {
  return active
    ? 'champion-item active rounded-xl border border-accent bg-accent/8 px-2.5 py-2.25'
    : 'champion-item rounded-xl border border-border-default bg-white/2 px-2.5 py-2.25';
}

function onChampionClick(configIndex: number | null): void {
  if (configIndex == null) return;
  props.surfaces.loadConfigDetail(configIndex).catch(() => {});
}

function onPlotClick(configIndex: number): void {
  props.surfaces.loadConfigDetail(configIndex).catch(() => {});
}
</script>

<template>
  <section id="stage-command-center" class="stage-view">
    <div class="stage-grid grid grid-cols-[repeat(12,minmax(0,1fr))] gap-3">
      <div class="stage-block half panel-card col-span-6 rounded-xl border border-border-default bg-panel p-3.5 max-[900px]:col-span-12">
        <h3 class="mb-2">{{ t('v7explore.topChampions') }}</h3>
        <div id="champion-list" class="champion-list flex flex-col gap-2">
          <div v-if="!champions.length" class="placeholder-panel flex min-h-[220px] items-center justify-center rounded-[12px] border border-dashed border-border-default bg-white/1 p-5 text-center text-secondary">{{ t('v7explore.noChampions') }}</div>
          <button
            v-for="champion in champions"
            :key="String(champion.configIndex)"
            type="button"
            :class="championItemClass(champion.active)"
            @click="onChampionClick(champion.configIndex)"
          >
            <div class="champion-row mb-1 flex min-w-0 items-center justify-between gap-2.5">
              <div class="champion-head mb-1 flex items-center justify-between gap-3"><strong class="text-base text-primary">#{{ champion.configIndex }}</strong></div>
              <div class="champion-style min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-secondary">{{ champion.style }}</div>
              <span class="chip inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-bold tracking-[0.04em] text-secondary">{{ champion.rankText }}</span>
            </div>
            <div class="champion-meta flex flex-wrap gap-1.25">
              <span class="chip inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-bold tracking-[0.04em] text-secondary">{{ champion.scoreText }}</span>
              <span class="chip inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-bold tracking-[0.04em] text-secondary">{{ champion.perfText }}</span>
              <span class="chip inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-bold tracking-[0.04em] text-secondary">{{ champion.robText }}</span>
              <span class="chip inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-bold tracking-[0.04em] text-secondary">{{ champion.riskText }}</span>
            </div>
          </button>
        </div>
      </div>
      <div class="stage-block half panel-card col-span-6 rounded-xl border border-border-default bg-panel p-3.5 max-[900px]:col-span-12">
        <h3 class="mb-2">{{ t('v7explore.insights') }}</h3>
        <div id="insight-list" class="insight-list flex flex-col gap-2">
          <div v-if="!insights.length" class="placeholder-panel flex min-h-[220px] items-center justify-center rounded-[12px] border border-dashed border-border-default bg-white/1 p-5 text-center text-secondary">{{ t('v7explore.noInsights') }}</div>
          <div v-for="(insight, index) in insights" :key="index" class="insight-item rounded-xl border border-border-default bg-white/2 p-2.5">
            <div class="status-chip" :class="statusChipClass(insight.levelClass)" style="margin-bottom: 8px">{{ insight.levelText }}</div>
            <div>{{ insight.text }}</div>
          </div>
        </div>
      </div>
      <div class="stage-block panel-card col-span-12 rounded-xl border border-border-default bg-panel p-3.5">
        <h3 class="mb-2">{{ t('v7explore.paretoFrontPreview') }}</h3>
        <div class="toolbar flex flex-wrap gap-2" style="margin-bottom: 12px">
          <div class="check-row flex min-h-8 items-center gap-2 text-secondary" style="max-width: 280px">
            <input id="preview-use-weighted" class="h-4 w-4" v-model="store.state.previewUseWeighted" type="checkbox" @change="surfaces.refreshPreviewFromSettings()" />
            <label for="preview-use-weighted">{{ t('v7explore.useWeightedMetrics') }}</label>
          </div>
          <div class="check-row flex min-h-8 items-center gap-2 text-secondary" style="max-width: 260px">
            <input id="preview-show-all" class="h-4 w-4" v-model="store.state.previewShowAll" type="checkbox" @change="surfaces.refreshPreviewFromSettings()" />
            <label for="preview-show-all">{{ t('v7explore.showAllConfigs') }}</label>
          </div>
        </div>
        <div class="preview-grid grid grid-cols-[1fr_1fr] gap-3 max-[900px]:grid-cols-1">
          <div class="chart-card min-w-0">
            <p class="muted-line text-secondary" id="preview-left-summary">{{ leftSummary }}</p>
            <div class="chart-wrap relative overflow-hidden min-w-0" id="preview-pareto-wrap">
              <ScatterChart
                chart-id="preview-pareto-chart"
                :spec="preview"
                placeholder-key="v7explore.loadToRenderParetoPreview"
                is-preview
                click-selects-config
                :best-match-index="playgroundPayload?.best_match?.config_index ?? null"
                @plot-click="onPlotClick"
              />
            </div>
          </div>
          <div class="chart-card min-w-0">
            <p class="muted-line text-secondary" id="preview-right-summary">{{ summaries.right }}</p>
            <div class="chart-wrap relative overflow-hidden min-w-0" id="preview-robustness-wrap">
              <ScatterChart
                chart-id="preview-robustness-chart"
                :spec="robustness"
                placeholder-key="v7explore.loadToRenderRobustnessPreview"
                is-preview
                click-selects-config
                :best-match-index="playgroundPayload?.best_match?.config_index ?? null"
                @plot-click="onPlotClick"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
