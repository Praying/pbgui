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
    <div class="stage-grid">
      <div class="stage-block half panel-card">
        <h3>{{ t('v7explore.topChampions') }}</h3>
        <div id="champion-list" class="champion-list">
          <div v-if="!champions.length" class="placeholder-panel">{{ t('v7explore.noChampions') }}</div>
          <button
            v-for="champion in champions"
            :key="String(champion.configIndex)"
            type="button"
            class="champion-item"
            :class="{ active: champion.active }"
            @click="onChampionClick(champion.configIndex)"
          >
            <div class="champion-row">
              <div class="champion-head"><strong>#{{ champion.configIndex }}</strong></div>
              <div class="champion-style">{{ champion.style }}</div>
              <span class="chip">{{ champion.rankText }}</span>
            </div>
            <div class="champion-meta">
              <span class="chip">{{ champion.scoreText }}</span>
              <span class="chip">{{ champion.perfText }}</span>
              <span class="chip">{{ champion.robText }}</span>
              <span class="chip">{{ champion.riskText }}</span>
            </div>
          </button>
        </div>
      </div>
      <div class="stage-block half panel-card">
        <h3>{{ t('v7explore.insights') }}</h3>
        <div id="insight-list" class="insight-list">
          <div v-if="!insights.length" class="placeholder-panel">{{ t('v7explore.noInsights') }}</div>
          <div v-for="(insight, index) in insights" :key="index" class="insight-item">
            <div class="status-chip" :class="insight.levelClass" style="margin-bottom: 8px">{{ insight.levelText }}</div>
            <div>{{ insight.text }}</div>
          </div>
        </div>
      </div>
      <div class="stage-block panel-card">
        <h3>{{ t('v7explore.paretoFrontPreview') }}</h3>
        <div class="toolbar" style="margin-bottom: 12px">
          <div class="check-row" style="max-width: 280px">
            <input id="preview-use-weighted" v-model="store.state.previewUseWeighted" type="checkbox" @change="surfaces.refreshPreviewFromSettings()" />
            <label for="preview-use-weighted">{{ t('v7explore.useWeightedMetrics') }}</label>
          </div>
          <div class="check-row" style="max-width: 260px">
            <input id="preview-show-all" v-model="store.state.previewShowAll" type="checkbox" @change="surfaces.refreshPreviewFromSettings()" />
            <label for="preview-show-all">{{ t('v7explore.showAllConfigs') }}</label>
          </div>
        </div>
        <div class="preview-grid">
          <div class="chart-card">
            <p class="muted-line" id="preview-left-summary">{{ leftSummary }}</p>
            <div class="chart-wrap" id="preview-pareto-wrap">
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
          <div class="chart-card">
            <p class="muted-line" id="preview-right-summary">{{ summaries.right }}</p>
            <div class="chart-wrap" id="preview-robustness-wrap">
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
