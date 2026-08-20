<script setup lang="ts">
/**
 * Selected-config detail — renderDetail (:3849-3893) over the legacy markup
 * (:1506-1558): metrics mini-grid, style rows, robustness, scenario metrics,
 * all-metrics (capped at 24) and the full-config panel. The full-config
 * chrome comes from the shared /app/js/json_panel.js global (:4739-4746) —
 * same pattern as v7_strategy_explorer's RawConfigPanel; a plain <pre> is
 * the fallback when the global is unavailable (e.g. jsdom).
 *
 * The "Create Optimize Preset from this Config" section (:1559-1623) is
 * M-v7-7 scope (preset build + handoffs) and lands there.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { detailViewModel } from '../lib/viewModels';
import { metricTooltip } from '../lib/metricDocs';
import type { ParetoStore } from '../composables/useParetoSession';

interface JsonPanelGlobal {
  createPanelHtml(options: { wrapId: string; preId: string; title: string; collapsedHeight: string }): string;
  setContent(preId: string, value: unknown, options?: { expanded?: boolean }): void;
}

const props = defineProps<{ store: ParetoStore }>();
const { t } = useI18n();
const store = props.store;

const container = ref<HTMLElement | null>(null);

const detail = computed(() => store.state.selectedDetail);
const vm = computed(() => detailViewModel(detail.value, (key, params) => t(key, params ?? {})));

function panel(): JsonPanelGlobal | undefined {
  return (window as unknown as { PBGuiJsonPanel?: JsonPanelGlobal }).PBGuiJsonPanel;
}

/** renderDetail's setContent call (:3860, :3892) — collapsed on every apply. */
function syncContent(): void {
  panel()?.setContent('detail-full-config', vm.value.fullConfigText, { expanded: false });
}

/** The one-time panel chrome install (:4739-4746). */
onMounted(() => {
  const root = container.value;
  const jsonPanel = panel();
  if (!root || !jsonPanel) return;
  root.innerHTML = jsonPanel.createPanelHtml({
    wrapId: 'detail-full-config-wrap',
    preId: 'detail-full-config',
    title: t('v7explore.config'),
    collapsedHeight: '400px',
  });
  const wrap = document.getElementById('detail-full-config-wrap');
  if (wrap) wrap.style.marginTop = '0';
  syncContent();
});

watch(() => vm.value.fullConfigText, syncContent);
</script>

<template>
  <section id="selected-config-detail" class="panel-card">
    <div class="detail-summary-row">
      <div>
        <h3 id="detail-title" style="margin: 0">{{ vm.title }}</h3>
      </div>
    </div>

    <div id="selected-config-section" class="detail-grid">
      <section class="detail-block panel-card">
        <div class="overview-grid">
          <div>
            <h4>{{ t('v7explore.metrics') }}</h4>
            <div id="detail-top-metrics" class="mini-grid">
              <div v-if="!vm.topMetrics.length" class="placeholder-panel" style="min-height: 120px">{{ t('v7explore.selectChampionToPopulate') }}</div>
              <div v-for="metric in vm.topMetrics" :key="metric.name" class="mini-metric">
                <div class="label">{{ metric.name }}</div>
                <div class="value">{{ metric.value }}</div>
              </div>
            </div>
          </div>
          <div>
            <h4>{{ t('v7explore.tradingStyle') }}</h4>
            <div id="detail-style-panel" class="detail-list">
              <div v-if="!detail" class="placeholder-panel" style="min-height: 120px">{{ t('v7explore.tradingStyleWillAppear') }}</div>
              <div v-for="(row, index) in vm.styleRows" :key="index" class="detail-item">
                <div class="detail-head"><strong>{{ row.strong }}</strong><span class="chip">{{ row.chip }}</span></div>
              </div>
            </div>
          </div>
          <div>
            <h4>{{ t('v7explore.robustness') }}</h4>
            <div id="detail-risk-profile" class="mini-grid">
              <div v-if="!vm.riskProfile.length" class="placeholder-panel" style="min-height: 120px">{{ t('v7explore.riskMetricsWillAppear') }}</div>
              <div v-for="metric in vm.riskProfile" :key="metric.name" class="mini-metric">
                <div class="label">{{ metric.name }}</div>
                <div class="value">{{ metric.value }}</div>
              </div>
            </div>
            <div id="detail-robustness-panel" class="detail-list" style="margin-top: 8px">
              <div v-if="!detail" class="placeholder-panel" style="min-height: 80px">{{ t('v7explore.robustnessDetailsWillAppear') }}</div>
              <div v-else class="stats-table">
                <div class="stats-row">
                  <span class="stats-key">{{ t('v7explore.robustnessScore') }}</span>
                  <strong>{{ vm.robustnessText }}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="detail-scenario-section" v-show="vm.scenarioRows.length" class="detail-block half panel-card">
        <h4>{{ t('v7explore.scenarioMetrics') }}</h4>
        <div id="detail-scenario-metrics" class="detail-list">
          <div v-for="row in vm.scenarioRows" :key="row.name" class="detail-item">
            <div class="detail-head">
              <strong>{{ row.name }}</strong>
              <span class="chip">{{ t('v7explore.metricsShown', { count: row.metricsShown }) }}</span>
            </div>
            <div class="detail-meta">
              <span v-for="chip in row.chips" :key="chip.key" class="chip">{{ chip.key }}: {{ chip.value }}</span>
            </div>
          </div>
        </div>
      </section>
      <section class="detail-block half panel-card">
        <details class="expander-card">
          <summary>{{ t('v7explore.fullConfiguration') }}</summary>
          <!-- M-v7-7: the preset generator section (:1559-1623) lands here -->
          <div id="detail-full-config-panel" style="margin-top: 12px">
            <div ref="container"></div>
            <pre v-if="!panel()" id="detail-full-config" class="json-pre" data-collapsed-height="400px">{{ vm.fullConfigText }}</pre>
          </div>
        </details>
      </section>
      <section class="detail-block half panel-card">
        <details class="expander-card">
          <summary>{{ t('v7explore.allMetricsStatistics') }}</summary>
          <div id="detail-all-metrics" class="detail-list" style="margin-top: 12px">
            <div v-if="!vm.hasAllMetrics" class="placeholder-panel" style="min-height: 120px">{{ t('v7explore.allMetricsWillBeListed') }}</div>
            <div v-for="metric in vm.allMetrics" :key="metric.name" class="detail-item">
              <div class="detail-head"><strong :data-tip="metricTooltip(metric.name) || undefined">{{ metric.name }}</strong><span class="chip">{{ metric.value }}</span></div>
            </div>
          </div>
        </details>
      </section>
    </div>
  </section>
</template>
