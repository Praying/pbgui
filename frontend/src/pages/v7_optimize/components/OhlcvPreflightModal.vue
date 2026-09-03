<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  PhArrowClockwise,
  PhDatabase,
  PhDownloadSimple,
  PhStop,
  PhX,
} from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { serverMsg } from '@/shared/i18n';

const props = withDefaults(defineProps<{
  open: boolean;
  loading: boolean;
  error: string;
  payload?: Record<string, unknown>;
  job?: Record<string, unknown> | null;
}>(), { payload: () => ({}), job: null });
const emit = defineEmits<{ close: []; refresh: []; preload: []; stop: [] }>();
const { t, locale } = useI18n();

function translateServerMsg(msg: string): string {
  return serverMsg(msg, locale.value);
}

/* overall_status → Tailwind utilities (same tints as the former
   .opt-status-* rules; spelled out so the scanner sees them). */
const overallStatusClass = computed(() => {
  const status = String(summary.value?.overall_status || '').toLowerCase();
  if (status === 'pass' || status === 'ok' || status === 'ready' || status === 'complete') return 'bg-success/15 text-success-soft border-success/30';
  if (status === 'error' || status === 'fail' || status === 'blocked') return 'bg-danger/15 text-danger-soft border-danger/30';
  if (status === 'running' || status === 'preload' || status === 'too_young' || status === 'missing_market' || status === 'mixed') return 'bg-warning/15 text-warning-soft border-warning/30';
  return 'bg-surface-deep text-secondary border-border-default/60';
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

function overallStatusLabel(status: unknown): string {
  const s = String(status || '').toLowerCase();
  if (s === 'pass' || s === 'ok' || s === 'complete') return t('editor.preflight.status.pass');
  if (s === 'preload') return t('editor.preflight.status.preload');
  if (s === 'ready') return t('editor.preflight.status.ready');
  if (s === 'blocked') return t('editor.preflight.status.blocked');
  if (s === 'legacy') return t('editor.preflight.status.legacy');
  if (s === 'too_young') return t('editor.preflight.status.too_young');
  if (s === 'missing_market') return t('editor.preflight.status.missing_market');
  if (s === 'mixed') return t('editor.preflight.status.mixed');
  if (s === 'error' || s === 'fail') return t('editor.preflight.status.fail');
  if (s === 'empty') return t('editor.preflight.status.empty');
  return s;
}

const statusCountKeys: Record<string, string> = {
  store_complete: 'editor.preflight.counts.store_complete',
  legacy_importable: 'editor.preflight.counts.legacy_importable',
  missing_local: 'editor.preflight.counts.missing_local',
  blocked_by_persistent_gap: 'editor.preflight.counts.blocked_by_persistent_gap',
  missing_market: 'editor.preflight.counts.missing_market',
  coin_too_young: 'editor.preflight.counts.coin_too_young',
};

const statusGroupKeys: Record<string, string> = {
  store_complete: 'editor.preflight.groups.store_complete',
  legacy_importable: 'editor.preflight.groups.legacy_importable',
  missing_local: 'editor.preflight.groups.missing_local',
  blocked_by_persistent_gap: 'editor.preflight.groups.blocked_by_persistent_gap',
  missing_market: 'editor.preflight.groups.missing_market',
  coin_too_young: 'editor.preflight.groups.coin_too_young',
};

function countLabel(status: string): string {
  const key = statusCountKeys[status];
  return key ? t(key) : formatKey(status);
}

function groupLabel(status: string): string {
  const key = statusGroupKeys[status];
  return key ? t(key) : formatKey(status);
}

const detailPattern = /^(\d+)\s+(.+)$/;
const detailPartKeys: Record<string, string> = {
  'ready locally': 'editor.preflight.details.ready_locally',
  'available from the configured source': 'editor.preflight.details.source_available',
  'missing locally': 'editor.preflight.details.missing_locally',
  'would fetch on start': 'editor.preflight.details.would_fetch_on_start',
  'blocked by persistent gaps': 'editor.preflight.details.blocked_by_persistent_gaps',
  'not available on the selected exchanges': 'editor.preflight.details.not_available_on_exchanges',
  'too young for the requested window': 'editor.preflight.details.too_young_for_window',
};

function formatSummaryDetail(detail: unknown): string {
  if (!detail) return '';
  const text = String(detail);
  const direct = translateServerMsg(text);
  if (direct !== text) return direct;

  const parts = text.split(', ');
  const mapped = parts.map((part) => {
    const match = part.match(detailPattern);
    if (!match) return translateServerMsg(part);
    const count = match[1];
    const label = match[2];
    const key = label ? detailPartKeys[label] : undefined;
    if (key && count) {
      return `${count} ${t(key)}`;
    }
    return translateServerMsg(part);
  });
  return mapped.join('，');
}

const fieldKeyMap: Record<string, string> = {
  requested_start_date: 'editor.preflight.fields.requested_start_date',
  effective_start_date: 'editor.preflight.fields.effective_start_date',
  end_date: 'editor.preflight.fields.end_date',
  warmup_minutes: 'editor.preflight.fields.warmup_minutes',
  minimum_coin_age_days: 'editor.preflight.fields.minimum_coin_age_days',
  source_dir: 'editor.preflight.fields.source_dir',
  ohlcv_source_dir: 'editor.preflight.fields.ohlcv_source_dir',
  catalog_path: 'editor.preflight.fields.catalog_path',
  catalog_present: 'editor.preflight.fields.catalog_present',
  exchange: 'editor.preflight.fields.exchange',
  days: 'editor.preflight.fields.days',
  coin_count: 'editor.preflight.fields.coin_count',
  coins_mode: 'editor.preflight.fields.coins_mode',
  exchange_count: 'editor.preflight.fields.exchange_count',
  total_symbols: 'editor.preflight.fields.total_symbols',
  mode: 'editor.preflight.fields.mode',
};

function fieldLabel(key: string): string {
  const normKey = key.toLowerCase().replace(/[\s-]+/g, '_');
  const tKey = fieldKeyMap[normKey] || fieldKeyMap[key];
  return tKey ? t(tKey) : formatKey(key);
}

function fieldValue(value: unknown): string {
  if (value === true || value === 'true') return t('editor.preflight.values.yes');
  if (value === false || value === 'false') return t('editor.preflight.values.no');
  if (typeof value === 'string') {
    const v = value.toLowerCase().trim();
    if (v === 'explicit') return t('editor.preflight.values.explicit');
    if (v === 'all') return t('editor.preflight.values.all');
    return translateServerMsg(value);
  }
  return String(value ?? '');
}

function entryTitle(entry: Record<string, unknown>): string {
  const sides = Array.isArray(entry.sides) && entry.sides.length ? ` [${entry.sides.map(String).join('/')}]` : '';
  const exchange = entry.exchange ? t('editor.preflight.entryOn', { exchange: String(entry.exchange) }) : '';
  return `${String(entry.coin || entry.symbol || '?')}${sides}${exchange}`;
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[1100] grid place-items-center bg-backdrop p-3.5 sm:p-5">
    <section
      class="flex w-[min(780px,100%)] max-h-[min(88vh,800px)] max-h-[min(88dvh,800px)] flex-col overflow-hidden rounded-xl border border-border-default bg-panel shadow-[var(--shadow-modal)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opt-ohlcv-title"
    >
      <header class="flex shrink-0 items-center justify-between gap-4 border-b border-border-default bg-surface-deep/40 px-5 py-3.5 max-[600px]:px-4">
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent" aria-hidden="true">
            <PbIcon :icon="PhDatabase" :size="17" />
          </div>
          <div class="min-w-0">
            <h2 id="opt-ohlcv-title" class="m-0 truncate text-[15px] font-bold tracking-tight text-primary">{{ t('editor.preflight.title') }}</h2>
            <p class="mt-0.5 text-xs leading-snug text-secondary">{{ t('editor.preflight.running') }}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="size-8 shrink-0 p-0 text-secondary transition-colors hover:text-primary cursor-pointer"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <PbIcon :icon="PhX" :size="17" />
        </Button>
      </header>

      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 max-[600px]:p-4 text-[13px]">
        <div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3 text-secondary">
          <PbIcon :icon="PhArrowClockwise" :size="24" class="animate-spin text-accent" />
          <p class="text-[13px] font-medium text-secondary">{{ t('editor.preflight.running') }}</p>
        </div>

        <div v-if="error" class="rounded-lg border border-danger/40 bg-danger/10 p-3.5 text-[13px] text-danger-soft leading-relaxed">
          {{ error }}
        </div>

        <template v-if="!loading && Object.keys(payload).length">
          <!-- Summary Card -->
          <section class="rounded-lg border border-border-default/80 bg-surface-deep/50 p-4">
            <div class="flex items-center justify-between gap-3">
              <strong class="text-[13.5px] font-semibold text-primary">{{ t('editor.preflight.sectionSummary') }}</strong>
              <span
                v-if="summary.overall_status"
                class="inline-flex rounded-md border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider"
                :class="overallStatusClass"
              >
                {{ overallStatusLabel(summary.overall_status) }}
              </span>
            </div>
            <h3 v-if="summary.headline" class="mt-2 text-[14px] font-bold text-primary">{{ translateServerMsg(String(summary.headline)) }}</h3>
            <p v-if="summary.detail" class="mt-1 text-[13px] text-secondary leading-relaxed">{{ formatSummaryDetail(summary.detail) }}</p>

            <div v-if="counts.length" class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="[status, count] in counts"
                :key="status"
                class="inline-flex items-center gap-1.5 rounded-md border border-border-default/60 bg-elevated/60 px-2.5 py-1 text-xs text-secondary"
              >
                <b class="font-mono text-primary font-bold">{{ count }}</b>
                <span>{{ countLabel(status) }}</span>
              </span>
            </div>

            <p v-if="summary.preload_detail" class="mt-2.5 text-xs text-secondary/80 leading-relaxed">{{ translateServerMsg(String(summary.preload_detail)) }}</p>
          </section>

          <!-- Request & Universe 2-Col Grid -->
          <div v-if="Object.keys(request).length || Object.keys(universe).length" class="grid grid-cols-2 gap-3.5 max-[700px]:grid-cols-1">
            <section v-if="Object.keys(request).length" class="rounded-lg border border-border-default/80 bg-surface-deep/50 p-4">
              <strong class="text-[13px] font-semibold text-primary">{{ t('editor.preflight.sectionRequest') }}</strong>
              <dl class="mt-2.5 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-3 gap-y-1.5 text-xs">
                <template v-for="(value, key) in request" :key="key">
                  <dt class="text-secondary font-medium">{{ fieldLabel(String(key)) }}</dt>
                  <dd class="m-0 font-mono text-primary truncate" :title="fieldValue(value)">{{ fieldValue(value) }}</dd>
                </template>
              </dl>
            </section>

            <section v-if="Object.keys(universe).length" class="rounded-lg border border-border-default/80 bg-surface-deep/50 p-4">
              <strong class="text-[13px] font-semibold text-primary">{{ t('editor.preflight.sectionUniverse') }}</strong>
              <dl class="mt-2.5 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-3 gap-y-1.5 text-xs">
                <template v-for="(value, key) in universe" :key="key">
                  <dt class="text-secondary font-medium">{{ fieldLabel(String(key)) }}</dt>
                  <dd class="m-0 font-mono text-primary truncate" :title="fieldValue(value)">{{ fieldValue(value) }}</dd>
                </template>
              </dl>
            </section>
          </div>

          <!-- Sample Groups -->
          <section v-for="group in sampleGroups" :key="group.status" class="rounded-lg border border-border-default/80 bg-surface-deep/50 p-4">
            <div class="flex items-center justify-between gap-2">
              <strong class="text-[13px] font-semibold text-primary capitalize">{{ groupLabel(group.status) }}</strong>
              <span class="rounded bg-elevated/80 px-1.5 py-0.5 text-[11px] font-mono text-secondary">{{ group.entries.length }}</span>
            </div>
            <div class="mt-2.5 grid grid-cols-2 gap-2 max-[700px]:grid-cols-1">
              <article
                v-for="(entry, index) in group.entries"
                :key="`${group.status}-${index}`"
                class="flex flex-col gap-1 rounded-md border border-border-default/60 bg-elevated/40 p-2.5 text-xs"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-mono font-semibold text-primary text-[12.5px]">{{ entryTitle(entry) }}</span>
                </div>
                <span v-if="entry.note || entry.status_label" class="text-secondary leading-snug">{{ translateServerMsg(String(entry.note || entry.status_label || '')) }}</span>
                <small v-if="entry.effective_start_date" class="font-mono text-[11px] text-secondary/80">
                  {{ t('editor.preflight.entryStart', { d: String(entry.effective_start_date) }) }}
                </small>
              </article>
            </div>
          </section>

          <!-- Notes -->
          <ul v-if="notes.length" class="m-0 list-disc pl-5 space-y-1 text-xs text-secondary">
            <li v-for="note in notes" :key="note">{{ translateServerMsg(note) }}</li>
          </ul>
        </template>

        <!-- Preload Job section -->
        <section v-if="job" class="opt-ohlcv-job rounded-lg border border-border-default/80 bg-surface-deep/50 p-4">
          <div class="flex items-center justify-between gap-3">
            <strong class="text-[13.5px] font-semibold text-primary">{{ t('editor.preflight.jobTitle') }}</strong>
            <span
              class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-semibold"
              :class="jobRunning ? 'bg-warning/15 text-warning-soft border border-warning/30' : 'bg-elevated text-secondary border border-border-default/60'"
            >
              <span v-if="jobRunning" class="size-1.5 rounded-full bg-warning animate-pulse"></span>
              {{ jobStatusLabel }}
            </span>
          </div>

          <div class="mt-2.5 flex flex-wrap gap-2 text-xs text-secondary">
            <span v-if="job.pid" class="rounded bg-elevated/80 px-2 py-0.5 font-mono"><b class="text-primary">PID</b> {{ String(job.pid) }}</span>
            <span v-if="job.started_at_iso" class="rounded bg-elevated/80 px-2 py-0.5 font-mono"><b class="text-primary">{{ t('editor.preflight.labelStarted') }}</b> {{ String(job.started_at_iso) }}</span>
            <span v-if="job.finished_at_iso" class="rounded bg-elevated/80 px-2 py-0.5 font-mono"><b class="text-primary">{{ t('editor.preflight.labelFinished') }}</b> {{ String(job.finished_at_iso) }}</span>
          </div>

          <p v-if="job.error" class="mt-2 text-xs text-danger-soft leading-relaxed">{{ translateServerMsg(String(job.error)) }}</p>
          <pre v-if="logTail.length" class="mt-2.5 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md border border-border-default/80 bg-page p-3 font-mono text-[11.5px] leading-relaxed text-primary">{{ logTail.join('\n') }}</pre>
        </section>
      </div>

      <footer class="flex shrink-0 items-center justify-end gap-2.5 border-t border-border-default bg-surface-deep/40 px-5 py-3.5 max-[600px]:px-4">
        <Button data-action="refresh" type="button" variant="default" :disabled="loading" class="h-9 gap-1.5 text-[13px]" @click="emit('refresh')">
          <PbIcon :icon="PhArrowClockwise" :size="15" :class="{ 'animate-spin': loading }" />
          {{ t('editor.preflight.refreshBtn') }}
        </Button>
        <Button v-if="jobRunning" variant="danger" data-action="stop" type="button" class="h-9 gap-1.5 text-[13px]" @click="emit('stop')">
          <PbIcon :icon="PhStop" :size="15" />
          {{ t('editor.preflight.stopBtn') }}
        </Button>
        <Button v-else variant="primary" data-action="preload" type="button" :disabled="!preloadSupported || loading" class="h-9 gap-1.5 text-[13px]" @click="emit('preload')">
          <PbIcon :icon="PhDownloadSimple" :size="15" />
          {{ translateServerMsg(String(summary.preload_label || t('editor.preflight.preloadDefault'))) }}
        </Button>
      </footer>
    </section>
  </div>
</template>


