<script setup lang="ts">
/**
 * MetricHistoryChart — the vps_monitor polyline sparkline + point list
 * (App.vue history modal), extracted so vps_manager's metric-history
 * modal can render the same view instead of a raw JsonViewer dump.
 *
 * Accepts the loosely-shaped history payloads both pages receive:
 * { points | cumulative_points | fills_points | daily_points | values }.
 */
import { computed } from 'vue';

interface HistoryPointLike {
  ts?: number | string;
  value?: number | string;
}

interface HistoryPayloadLike {
  points?: HistoryPointLike[];
  cumulative_points?: HistoryPointLike[];
  fills_points?: HistoryPointLike[];
  daily_points?: HistoryPointLike[];
  values?: number[];
  [key: string]: unknown;
}

const props = defineProps<{ data: HistoryPayloadLike | null }>();

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatAge(timestamp: unknown): string {
  const ts = num(timestamp);
  if (!ts) return '—';
  const age = Math.max(0, Date.now() / 1000 - ts);
  if (age < 5) return 'now';
  if (age < 60) return `${Math.floor(age)}s`;
  if (age < 3600) return `${Math.floor(age / 60)}m`;
  if (age < 86400) return `${Math.floor(age / 3600)}h`;
  return `${Math.floor(age / 86400)}d`;
}

const rows = computed<Array<{ ts: string; value: string }>>(() => {
  const data = props.data;
  if (!data) return [];
  const points = data.points || data.cumulative_points || data.fills_points || data.daily_points;
  if (Array.isArray(points)) {
    return points.map((point) => ({ ts: formatAge(point.ts), value: num(point.value).toFixed(2) }));
  }
  if (Array.isArray(data.values)) {
    return data.values.map((value, index) => ({ ts: String(index + 1), value: num(value).toFixed(2) }));
  }
  return [];
});

const polyline = computed(() => {
  const values = rows.value;
  const max = Math.max(1, ...values.map((point) => num(point.value)));
  return values
    .map((point, index) => `${(index / Math.max(1, values.length - 1)) * 580 + 10},${165 - (num(point.value) / max) * 145}`)
    .join(' ');
});
</script>

<template>
  <div class="w-full min-h-[120px] rounded-md bg-page p-2">
    <svg viewBox="0 0 600 180" preserveAspectRatio="none" width="100%" height="180" role="img">
      <polyline v-if="rows.length" :points="polyline" fill="none" stroke="var(--accent)" stroke-width="2" />
    </svg>
  </div>
  <div class="mt-2.5 flex flex-wrap gap-2 text-xs text-primary">
    <span v-for="point in rows" :key="`${point.ts}:${point.value}`">{{ point.ts }}: {{ point.value }}</span>
  </div>
</template>
