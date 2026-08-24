<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(defineProps<{
  open: boolean;
  loading: boolean;
  error: string;
  payload?: Record<string, unknown>;
  job?: Record<string, unknown> | null;
}>(), { payload: () => ({}), job: null });
const emit = defineEmits<{ close: []; refresh: []; preload: []; stop: [] }>();
const { t } = useI18n();

/* overall_status → Tailwind utilities (same tints as the former
   .opt-status-* rules; spelled out so the scanner sees them). */
const overallStatusClass = computed(() => {
  const status = String(summary.value?.overall_status || '').toLowerCase();
  if (status === 'pass' || status === 'ok' || status === 'complete') return 'bg-success/15 text-success';
  if (status === 'error' || status === 'fail') return 'bg-danger/15 text-danger';
  if (status === 'running') return 'bg-warning/15 text-[#d0a36f]';
  return 'bg-secondary/15 text-secondary';
});
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
const summary = computed(() => object(props.payload.summary));
const counts = computed(() => Object.entries(object(summary.value.counts)).filter(([, value]) => Number(value) > 0));
const request = computed(() => object(props.payload.request));
const universe = computed(() => object(props.payload.universe));
const notes = computed(() => Array.isArray(props.payload.notes) ? props.payload.notes.map(String) : []);
const sampleGroups = computed(() => Object.entries(object(props.payload.best_samples)).map(([status, entries]) => ({ status, entries: Array.isArray(entries) ? entries.map(object) : [] })).filter((group) => group.entries.length));
const jobStatus = computed(() => String(props.job?.status || ''));
const jobRunning = computed(() => jobStatus.value === 'queued' || jobStatus.value === 'running');
const preloadSupported = computed(() => summary.value.preload_supported === true);
const logTail = computed(() => Array.isArray(props.job?.log_tail) ? props.job!.log_tail!.map(String) : []);
const jobStatusLabel = computed(() => {
  if (jobStatus.value === 'running') return t('editor.preflight.statusRunning');
  if (jobStatus.value === 'queued') return t('editor.preflight.statusQueued');
  if (jobStatus.value === 'completed') return t('editor.preflight.statusCompleted');
  if (jobStatus.value === 'stopped') return t('editor.preflight.statusStopped');
  return jobStatus.value;
});
function formatKey(value: string): string { return value.replace(/_/g, ' '); }
function entryTitle(entry: Record<string, unknown>): string {
  const sides = Array.isArray(entry.sides) && entry.sides.length ? ` [${entry.sides.map(String).join('/')}]` : '';
  const exchange = entry.exchange ? t('editor.preflight.entryOn', { exchange: String(entry.exchange) }) : '';
  return `${String(entry.coin || entry.symbol || '?')}${sides}${exchange}`;
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[1000] grid place-items-center bg-backdrop">
    <section class="opt-modal opt-ohlcv-modal" role="dialog" aria-modal="true" aria-labelledby="opt-ohlcv-title">
      <header class="flex shrink-0 items-center justify-between gap-2.5 border-b border-border-default px-3.5 py-3"><h2 id="opt-ohlcv-title">{{ t('editor.preflight.title') }}</h2><button class="min-h-[30px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-2.5 py-1.25 text-primary hover:border-accent" type="button" @click="emit('close')">{{ t('common.close') }}</button></header>
      <div class="grid min-h-0 gap-3 overflow-auto p-3.5 block">
        <p v-if="loading" class="text-xs text-secondary">{{ t('editor.preflight.running') }}</p>
        <p v-if="error" class="text-danger-soft">{{ error }}</p>
        <template v-if="!loading && Object.keys(payload).length">
          <section class="mb-3 rounded-[7px] border border-border-default bg-white/[0.018] p-3">
            <div class="flex items-center justify-between gap-3"><strong>{{ t('editor.preflight.sectionSummary') }}</strong><span class="inline-flex rounded-full px-2 py-[3px] text-xs font-bold" :class="overallStatusClass">{{ String(summary.overall_status || '') }}</span></div>
            <h3>{{ String(summary.headline || '') }}</h3><p>{{ String(summary.detail || '') }}</p>
            <div class="mt-2.5 flex flex-wrap gap-[7px]"><span v-for="[status, count] in counts" :key="status"><b>{{ count }}</b> {{ formatKey(status) }}</span></div>
            <p v-if="summary.preload_detail" class="text-xs text-secondary">{{ String(summary.preload_detail) }}</p>
          </section>
          <div class="grid grid-cols-[1fr_1fr] gap-3 max-[700px]:grid-cols-1">
            <section v-if="Object.keys(request).length" class="mb-3 rounded-[7px] border border-border-default bg-white/[0.018] p-3"><strong>{{ t('editor.preflight.sectionRequest') }}</strong><dl><template v-for="(value, key) in request" :key="key"><dt>{{ formatKey(String(key)) }}</dt><dd>{{ String(value ?? '') }}</dd></template></dl></section>
            <section v-if="Object.keys(universe).length" class="mb-3 rounded-[7px] border border-border-default bg-white/[0.018] p-3"><strong>{{ t('editor.preflight.sectionUniverse') }}</strong><dl><template v-for="(value, key) in universe" :key="key"><dt>{{ formatKey(String(key)) }}</dt><dd>{{ String(value ?? '') }}</dd></template></dl></section>
          </div>
          <section v-for="group in sampleGroups" :key="group.status" class="mb-3 rounded-[7px] border border-border-default bg-white/[0.018] p-3"><strong>{{ formatKey(group.status) }}</strong><div class="mt-2 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[7px] max-[700px]:grid-cols-1"><article v-for="(entry, index) in group.entries" :key="`${group.status}-${index}`"><b>{{ entryTitle(entry) }}</b><span>{{ String(entry.note || entry.status_label || '') }}</span><small v-if="entry.effective_start_date">{{ t('editor.preflight.entryStart', { d: String(entry.effective_start_date) }) }}</small></article></div></section>
          <ul v-if="notes.length" class="text-secondary"><li v-for="note in notes" :key="note">{{ note }}</li></ul>
        </template>
        <section v-if="job" class="opt-ohlcv-job mb-3 rounded-[7px] border border-border-default bg-white/[0.018] p-3">
          <div class="flex items-center justify-between gap-3"><strong>{{ t('editor.preflight.jobTitle') }}</strong><span>{{ jobStatusLabel }}</span></div>
          <div class="mt-2.5 flex flex-wrap gap-[7px]"><span v-if="job.pid"><b>PID</b> {{ String(job.pid) }}</span><span v-if="job.started_at_iso"><b>{{ t('editor.preflight.labelStarted') }}</b> {{ String(job.started_at_iso) }}</span><span v-if="job.finished_at_iso"><b>{{ t('editor.preflight.labelFinished') }}</b> {{ String(job.finished_at_iso) }}</span></div>
          <p v-if="job.error" class="text-danger-soft">{{ String(job.error) }}</p>
          <pre v-if="logTail.length" class="max-h-[240px] m-[10px_0_0] overflow-auto whitespace-pre-wrap rounded-[5px] border border-border-default bg-page p-2.5 font-mono text-[11px] leading-[1.45] text-primary">{{ logTail.join('\n') }}</pre>
        </section>
      </div>
      <footer class="flex shrink-0 items-center justify-end gap-2.5 border-t border-border-default px-3.5 py-3">
        <button class="min-h-[30px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-2.5 py-1.25 text-primary hover:border-accent" data-action="refresh" type="button" :disabled="loading" @click="emit('refresh')">{{ t('editor.preflight.refreshBtn') }}</button>
        <button v-if="jobRunning" class="min-h-[30px] cursor-pointer rounded-sm border border-danger/45 bg-white/4 px-2.5 py-1.25 text-danger" data-action="stop" type="button" @click="emit('stop')">{{ t('editor.preflight.stopBtn') }}</button>
        <button v-else class="min-h-[30px] cursor-pointer rounded-sm border border-accent/55 bg-accent/18 px-2.5 py-1.25 text-accent" data-action="preload" type="button" :disabled="!preloadSupported || loading" @click="emit('preload')">{{ String(summary.preload_label || t('editor.preflight.preloadDefault')) }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
/* OHLCV section typography ported from styles/optimize.css. */
.opt-ohlcv-section h3 { margin: 8px 0 4px; font-size: 15px; }
.opt-ohlcv-section p { margin: 5px 0; }
.opt-ohlcv-section dl {
  display: grid;
  grid-template-columns: minmax(120px, 0.7fr) 1fr;
  gap: 5px 10px;
  margin: 10px 0 0;
}
.opt-ohlcv-section dt { color: var(--text-secondary); }
.opt-ohlcv-section dd { margin: 0; overflow-wrap: anywhere; }
.opt-ohlcv-counts span {
  padding: 4px 7px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 11px;
}
.opt-ohlcv-samples article {
  display: grid;
  gap: 3px;
  padding: 8px;
  border: 1px solid var(--border-default);
  border-radius: 5px;
}
.opt-ohlcv-samples article span,
.opt-ohlcv-samples article small { color: var(--text-secondary); }
</style>
