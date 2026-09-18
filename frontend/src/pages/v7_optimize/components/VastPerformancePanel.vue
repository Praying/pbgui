<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { buildChartSeries, canComparePerformanceRuns, formatMetric, formatMoney } from '../lib/vastModel';
import type { VastChartPoint } from '../lib/vastModel';
import type { VastPerformanceRun } from '../lib/vastTypes';

const props = defineProps<{ active: boolean }>();
const { t } = useI18n();
const runs = ref<VastPerformanceRun[]>([]);
const total = ref(0);
const offset = ref(0);
const fingerprint = ref<string | null>(null);
const filter = ref('');
const selectedIds = ref<string[]>([]);
const comparisonRuns = ref<VastPerformanceRun[]>([]);
const loading = ref(false);
const error = ref('');
const dragging = ref(false);
const dragAnchor = ref(-1);
let ignoreNextClick = false;
let clickResetTimer: number | undefined;
let requestGeneration = 0;
let requestController: AbortController | null = null;

const visibleRuns = computed(() => {
  const query = filter.value.trim().toLowerCase();
  if (!query) return runs.value;
  return runs.value.filter((run) => [
    run.config_name,
    run.hardware?.gpu_name,
    run.hardware?.machine_id,
    ...(run.workload?.coins || []),
    ...(run.workload?.exchanges || []),
  ].join(' ').toLowerCase().includes(query));
});
const selectedRuns = computed(() => selectedIds.value
  .map((identifier) => runs.value.find((run) => run.id === identifier))
  .filter((run): run is VastPerformanceRun => Boolean(run)));
const canCompare = computed(() => canComparePerformanceRuns(selectedRuns.value));
const canInspect = computed(() => selectedRuns.value.length === 1);
const canFilterWorkload = computed(() => Boolean(selectedRuns.value[0]?.fingerprint));

function resetRequest(): AbortController {
  requestGeneration += 1;
  requestController?.abort();
  requestController = new AbortController();
  return requestController;
}

async function refresh(): Promise<void> {
  if (!props.active) return;
  const generation = requestGeneration + 1;
  const controller = resetRequest();
  loading.value = true;
  error.value = '';
  const query = new URLSearchParams({ limit: '100', offset: String(offset.value) });
  if (fingerprint.value) query.set('fingerprint', fingerprint.value);
  try {
    const result = await apiFetch<{ runs?: VastPerformanceRun[]; total?: number }>(`/api/vast/performance?${query}`, { signal: controller.signal });
    if (generation !== requestGeneration || controller.signal.aborted) return;
    runs.value = result.runs ?? [];
    total.value = Number(result.total || 0);
    selectedIds.value = selectedIds.value.filter((identifier) => runs.value.some((run) => run.id === identifier));
  } catch (caught) {
    if (!controller.signal.aborted && generation === requestGeneration) error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function toggleRun(run: VastPerformanceRun): void {
  if (selectedIds.value.includes(run.id)) {
    selectedIds.value = selectedIds.value.filter((identifier) => identifier !== run.id);
    return;
  }
  if (selectedIds.value.length >= 4) return;
  selectedIds.value = [...selectedIds.value, run.id];
}

function beginRange(index: number, event: PointerEvent): void {
  if (event.button !== 0) return;
  ignoreNextClick = true;
  dragging.value = true;
  dragAnchor.value = index;
  toggleRun(visibleRuns.value[index]!);
}

function extendRange(index: number): void {
  if (!dragging.value || dragAnchor.value < 0) return;
  const start = Math.min(dragAnchor.value, index);
  const end = Math.max(dragAnchor.value, index);
  const rangeIds = visibleRuns.value.slice(start, end + 1).map((run) => run.id);
  selectedIds.value = [...new Set([...selectedIds.value, ...rangeIds])].slice(0, 4);
}

function stopRange(): void {
  dragging.value = false;
  dragAnchor.value = -1;
  window.clearTimeout(clickResetTimer);
  clickResetTimer = window.setTimeout(() => { ignoreNextClick = false; }, 0);
}

function handleRowClick(run: VastPerformanceRun): void {
  if (ignoreNextClick) {
    ignoreNextClick = false;
    window.clearTimeout(clickResetTimer);
    return;
  }
  toggleRun(run);
}

async function compare(inspect = false): Promise<void> {
  if (inspect ? !canInspect.value : !canCompare.value) return;
  const generation = requestGeneration + 1;
  const controller = resetRequest();
  loading.value = true;
  error.value = '';
  try {
    const result = await apiFetch<{ runs?: VastPerformanceRun[] }>('/api/vast/performance/compare', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedIds.value }),
      signal: controller.signal,
    });
    if (generation !== requestGeneration || controller.signal.aborted) return;
    comparisonRuns.value = result.runs ?? [];
  } catch (caught) {
    if (!controller.signal.aborted && generation === requestGeneration) error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function showSameWorkload(): void {
  const selectedFingerprint = selectedRuns.value[0]?.fingerprint;
  if (!selectedFingerprint) return;
  fingerprint.value = selectedFingerprint;
  offset.value = 0;
  comparisonRuns.value = [];
  void refresh();
}

function clearSelection(): void {
  selectedIds.value = [];
  fingerprint.value = null;
  offset.value = 0;
  filter.value = '';
  comparisonRuns.value = [];
  void refresh();
}

function page(delta: number): void {
  offset.value = Math.max(0, offset.value + delta * 100);
  comparisonRuns.value = [];
  void refresh();
}

function chartPoints(run: VastPerformanceRun, key: 'proxy_total' | 'exact_total'): Array<VastChartPoint | null> {
  return buildChartSeries(run.series?.counter || [], key);
}

function chartPath(points: Array<VastChartPoint | null>, allRuns: VastPerformanceRun[], key: 'proxy_total' | 'exact_total'): string {
  const allPoints = allRuns.flatMap((run) => chartPoints(run, key).filter((point): point is VastChartPoint => Boolean(point)));
  if (!allPoints.length) return '';
  const maxX = Math.max(...allPoints.map((point) => point.minutes), 1);
  const maxY = Math.max(...allPoints.map((point) => point.rate), 1);
  let path = '';
  let segmentOpen = false;
  for (const point of points) {
    if (!point) {
      segmentOpen = false;
      continue;
    }
    const x = 38 + (point.minutes / maxX) * 702;
    const y = 20 + (1 - point.rate / maxY) * 180;
    path += `${segmentOpen ? ' L' : ' M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    segmentOpen = true;
  }
  return path.trim();
}

function seriesColor(index: number): string {
  return ['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)'][index % 4]!;
}

watch(() => props.active, (active) => {
  if (active) void refresh();
  else resetRequest();
});

onMounted(() => {
  document.addEventListener('pointerup', stopRange);
  if (props.active) void refresh();
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerup', stopRange);
  window.clearTimeout(clickResetTimer);
  resetRequest();
});
</script>

<template>
  <section class="grid gap-3 rounded-md border border-border-subtle bg-page/35 p-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-md font-semibold text-primary">{{ t('v7optimize.cloudPerformanceHistory') }}</h3>
        <p class="mt-1 text-xs leading-5 text-secondary">{{ t('v7optimize.cloudPerformanceHint') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button type="button" variant="default" size="sm" :disabled="loading" @click="refresh">{{ t('common.refresh') }}</Button>
        <Button type="button" variant="default" size="sm" :disabled="loading || !canInspect" @click="compare(true)">{{ t('v7optimize.cloudViewRun') }}</Button>
        <Button type="button" variant="info" size="sm" data-test="performance-compare" :disabled="loading || !canCompare" @click="compare(false)">{{ t('v7optimize.cloudCompareSelected') }}</Button>
        <Button type="button" variant="default" size="sm" data-test="performance-same-workload" :disabled="loading || !canFilterWorkload" @click="showSameWorkload">{{ t('v7optimize.cloudSameWorkload') }}</Button>
        <Button type="button" variant="ghost" size="sm" :disabled="loading" @click="clearSelection">{{ t('v7optimize.cloudClearPerformance') }}</Button>
      </div>
    </div>

    <p v-if="error" class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-soft" role="alert">{{ error }}</p>
    <p v-if="loading" class="text-xs text-secondary" role="status">{{ t('common.loading') }}</p>

    <template v-if="comparisonRuns.length">
      <div class="grid gap-2 md:grid-cols-2">
        <article v-for="run in comparisonRuns" :key="run.id" data-test="performance-run-details" class="rounded-md border border-border-subtle bg-elevated/35 p-3">
          <strong class="text-sm text-primary">{{ run.hardware?.gpu_name || '-' }} · {{ t('v7optimize.cloudMachineNumber', { id: run.hardware?.machine_id || '-' }) }}</strong>
          <p class="mt-1 text-xs leading-5 text-secondary">{{ formatMetric(run.workers, 0) }} CPU · {{ formatMetric(run.summary?.proxy_per_minute, 1) }} proxy/min · {{ formatMetric(run.summary?.exact_per_minute, 1) }} exact/min</p>
          <p class="text-xs leading-5 text-secondary">{{ (run.workload?.coins || []).join(', ') || '-' }} · {{ (run.workload?.exchanges || []).join(', ') || '-' }} · {{ formatMoney(run.cost_estimate?.total_usd) }}</p>
        </article>
      </div>

      <div v-for="metric in (['proxy_total', 'exact_total'] as const)" :key="metric" class="grid gap-2 rounded-md border border-border-subtle bg-elevated/20 p-3">
        <strong class="text-sm text-primary">{{ metric === 'proxy_total' ? t('v7optimize.cloudProxyRateChart') : t('v7optimize.cloudExactRateChart') }}</strong>
        <div class="overflow-x-auto">
          <svg data-test="performance-chart" viewBox="0 0 760 230" role="img" :aria-label="metric === 'proxy_total' ? t('v7optimize.cloudProxyRateChart') : t('v7optimize.cloudExactRateChart')" class="min-w-[640px] w-full">
            <line x1="38" y1="200" x2="740" y2="200" stroke="var(--border-default)" />
            <line x1="38" y1="20" x2="38" y2="200" stroke="var(--border-default)" />
            <path
              v-for="(run, index) in comparisonRuns"
              :key="run.id"
              :d="chartPath(chartPoints(run, metric), comparisonRuns, metric)"
              fill="none"
              :stroke="seriesColor(index)"
              stroke-width="2"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div class="flex flex-wrap gap-3 text-xs text-secondary">
          <span v-for="(run, index) in comparisonRuns" :key="run.id" class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full" :style="{ background: seriesColor(index) }"></span>{{ run.hardware?.gpu_name || run.config_name || run.id }}</span>
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm" class="justify-self-start" @click="comparisonRuns = []">{{ t('v7optimize.cloudBackToHistory') }}</Button>
    </template>

    <template v-else>
      <Input v-model="filter" data-test="performance-filter" type="search" :placeholder="t('v7optimize.cloudPerformanceFilter')" />
      <div class="max-h-96 overflow-auto rounded-md border border-border-subtle">
        <table class="w-full min-w-[1100px] text-left text-xs">
          <thead class="sticky top-0 z-10 bg-panel text-secondary"><tr><th class="p-2">{{ t('v7optimize.cloudRunStatus') }}</th><th class="p-2">{{ t('v7optimize.cloudGpuMachine') }}</th><th class="p-2">CPU</th><th class="p-2">{{ t('v7optimize.cloudCoinsExchanges') }}</th><th class="p-2">{{ t('v7optimize.cloudScenariosCandles') }}</th><th class="p-2">{{ t('v7optimize.cloudProxyPerMinute') }}</th><th class="p-2">{{ t('v7optimize.cloudExactPerMinute') }}</th><th class="p-2">{{ t('v7optimize.cloudExactPerUsd') }}</th><th class="p-2">{{ t('v7optimize.cloudRunCost') }}</th><th class="p-2">{{ t('v7optimize.cloudWorkload') }}</th></tr></thead>
          <tbody>
            <tr
              v-for="(run, index) in visibleRuns"
              :key="run.id"
              data-test="performance-row"
              tabindex="0"
              :aria-selected="selectedIds.includes(run.id)"
              class="cursor-pointer border-t border-border-subtle outline-none focus-visible:ring-2 focus-visible:ring-accent"
              :class="selectedIds.includes(run.id) ? 'bg-accent/10 border-l-[3px] border-l-accent' : ''"
              @click="handleRowClick(run)"
              @keydown.enter.prevent="toggleRun(run)"
              @keydown.space.prevent="toggleRun(run)"
              @pointerdown="beginRange(index, $event)"
              @pointerenter="extendRange(index)"
            >
              <td class="p-2"><strong class="block text-primary">{{ run.config_name || run.id }}</strong><span class="text-secondary">{{ run.status || '-' }}</span></td>
              <td class="p-2">{{ run.hardware?.gpu_name || '-' }} · {{ run.hardware?.machine_id || '-' }}</td>
              <td class="p-2 tabular-nums">{{ formatMetric(run.hardware?.cpu_cores, 0) }}</td>
              <td class="max-w-64 p-2"><span class="block truncate">{{ (run.workload?.coins || []).join(', ') || '-' }}</span><span class="text-secondary">{{ (run.workload?.exchanges || []).join(', ') || '-' }}</span></td>
              <td class="p-2 tabular-nums">{{ formatMetric(run.workload?.scenario_count, 0) }} · {{ formatMetric(run.workload?.exported_candles, 0) }}</td>
              <td class="p-2 tabular-nums">{{ formatMetric(run.summary?.proxy_per_minute, 1) }}</td>
              <td class="p-2 tabular-nums">{{ formatMetric(run.summary?.exact_per_minute, 1) }}</td>
              <td class="p-2 tabular-nums">{{ formatMetric(run.summary?.exact_per_usd, 1) }}</td>
              <td class="p-2 tabular-nums">{{ formatMoney(run.cost_estimate?.total_usd) }}</td>
              <td class="max-w-48 truncate p-2 font-mono text-micro" :title="run.fingerprint || ''">{{ run.fingerprint ? run.fingerprint.slice(0, 12) : t('v7optimize.cloudUnverifiedWorkload') }}</td>
            </tr>
            <tr v-if="!visibleRuns.length"><td colspan="10" class="p-6 text-center text-secondary">{{ t('v7optimize.cloudNoPerformanceHistory') }}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs text-secondary">{{ t('v7optimize.cloudPerformanceSelection', { selected: selectedIds.length, total }) }}</span>
        <div class="flex gap-2"><Button type="button" variant="default" size="sm" :disabled="loading || offset === 0" @click="page(-1)">{{ t('common.previous') }}</Button><Button type="button" variant="default" size="sm" :disabled="loading || offset + 100 >= total" @click="page(1)">{{ t('common.next') }}</Button></div>
      </div>
    </template>
  </section>
</template>
