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
  <div v-if="open" class="opt-modal-backdrop">
    <section class="opt-modal opt-ohlcv-modal" role="dialog" aria-modal="true" aria-labelledby="opt-ohlcv-title">
      <header class="opt-modal-head"><h2 id="opt-ohlcv-title">{{ t('editor.preflight.title') }}</h2><button class="opt-btn" type="button" @click="emit('close')">{{ t('common.close') }}</button></header>
      <div class="opt-modal-body opt-ohlcv-body">
        <p v-if="loading" class="opt-muted">{{ t('editor.preflight.running') }}</p>
        <p v-if="error" class="opt-error">{{ error }}</p>
        <template v-if="!loading && Object.keys(payload).length">
          <section class="opt-ohlcv-section">
            <div class="opt-ohlcv-section-head"><strong>{{ t('editor.preflight.sectionSummary') }}</strong><span class="opt-status" :class="`opt-status-${String(summary.overall_status || '')}`">{{ String(summary.overall_status || '') }}</span></div>
            <h3>{{ String(summary.headline || '') }}</h3><p>{{ String(summary.detail || '') }}</p>
            <div class="opt-ohlcv-counts"><span v-for="[status, count] in counts" :key="status"><b>{{ count }}</b> {{ formatKey(status) }}</span></div>
            <p v-if="summary.preload_detail" class="opt-muted">{{ String(summary.preload_detail) }}</p>
          </section>
          <div class="opt-ohlcv-grid">
            <section v-if="Object.keys(request).length" class="opt-ohlcv-section"><strong>{{ t('editor.preflight.sectionRequest') }}</strong><dl><template v-for="(value, key) in request" :key="key"><dt>{{ formatKey(String(key)) }}</dt><dd>{{ String(value ?? '') }}</dd></template></dl></section>
            <section v-if="Object.keys(universe).length" class="opt-ohlcv-section"><strong>{{ t('editor.preflight.sectionUniverse') }}</strong><dl><template v-for="(value, key) in universe" :key="key"><dt>{{ formatKey(String(key)) }}</dt><dd>{{ String(value ?? '') }}</dd></template></dl></section>
          </div>
          <section v-for="group in sampleGroups" :key="group.status" class="opt-ohlcv-section"><strong>{{ formatKey(group.status) }}</strong><div class="opt-ohlcv-samples"><article v-for="(entry, index) in group.entries" :key="`${group.status}-${index}`"><b>{{ entryTitle(entry) }}</b><span>{{ String(entry.note || entry.status_label || '') }}</span><small v-if="entry.effective_start_date">{{ t('editor.preflight.entryStart', { d: String(entry.effective_start_date) }) }}</small></article></div></section>
          <ul v-if="notes.length" class="opt-ohlcv-notes"><li v-for="note in notes" :key="note">{{ note }}</li></ul>
        </template>
        <section v-if="job" class="opt-ohlcv-section opt-ohlcv-job">
          <div class="opt-ohlcv-section-head"><strong>{{ t('editor.preflight.jobTitle') }}</strong><span>{{ jobStatusLabel }}</span></div>
          <div class="opt-ohlcv-counts"><span v-if="job.pid"><b>PID</b> {{ String(job.pid) }}</span><span v-if="job.started_at_iso"><b>{{ t('editor.preflight.labelStarted') }}</b> {{ String(job.started_at_iso) }}</span><span v-if="job.finished_at_iso"><b>{{ t('editor.preflight.labelFinished') }}</b> {{ String(job.finished_at_iso) }}</span></div>
          <p v-if="job.error" class="opt-error">{{ String(job.error) }}</p>
          <pre v-if="logTail.length" class="opt-ohlcv-log">{{ logTail.join('\n') }}</pre>
        </section>
      </div>
      <footer class="opt-modal-actions">
        <button class="opt-btn" data-action="refresh" type="button" :disabled="loading" @click="emit('refresh')">{{ t('editor.preflight.refreshBtn') }}</button>
        <button v-if="jobRunning" class="opt-btn danger" data-action="stop" type="button" @click="emit('stop')">{{ t('editor.preflight.stopBtn') }}</button>
        <button v-else class="opt-btn primary" data-action="preload" type="button" :disabled="!preloadSupported || loading" @click="emit('preload')">{{ String(summary.preload_label || t('editor.preflight.preloadDefault')) }}</button>
      </footer>
    </section>
  </div>
</template>
