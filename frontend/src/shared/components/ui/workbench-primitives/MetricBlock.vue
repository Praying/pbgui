<script setup lang="ts">
/**
 * MetricBlock — compact label/value/detail composition for operational
 * summaries. It deliberately renders values as text so callers cannot inject
 * markup through a metric payload.
 */
type MetricTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface MetricBlockProps {
  label: string;
  value: string | number;
  detail?: string;
  tone?: MetricTone;
}

const props = withDefaults(defineProps<MetricBlockProps>(), {
  tone: 'neutral',
});
</script>

<template>
  <dl
    class="metric-block min-w-0 rounded-md border border-border-subtle bg-card px-3 py-2"
    :class="`metric-block--${props.tone}`"
    :data-tone="props.tone"
  >
    <dt class="truncate text-xs font-semibold uppercase tracking-label text-muted">
      {{ props.label }}
    </dt>
    <dd class="m-0 mt-1 truncate text-lg font-semibold tabular-nums text-primary">
      {{ props.value }}
    </dd>
    <dd v-if="props.detail" class="m-0 mt-0.5 truncate text-xs text-secondary">
      {{ props.detail }}
    </dd>
  </dl>
</template>
