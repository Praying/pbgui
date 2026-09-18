<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { formatMetric, formatMoney, progressPercent } from '../lib/vastModel';
import type { VastJob, VastProgress, VastRental, VastWorker } from '../lib/vastTypes';

const props = defineProps<{
  jobs: VastJob[];
  worker: VastWorker | null;
  queuePaused: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  'queue-action': [action: 'pause' | 'resume' | 'end'];
  'job-action': [job: VastJob, action: 'stop' | 'recover' | 'requeue' | 'cleanup' | 'delete'];
  'adjust-deadline': [rental: VastRental, minutes: number];
  'adjust-budget': [rental: VastRental, budget: number];
  'adjust-reserve': [rental: VastRental, reserve: number];
}>();

const { t } = useI18n();
const deadlineMinutes = ref(60);
const budgetDraft = ref<number | null>(null);
const reserveDraft = ref<number | null>(null);

const activeRental = computed(() => props.jobs.find((job) => job.rental)?.rental || props.worker?.rental || null);
const activeJobs = computed(() => props.jobs.filter((job) => !['completed', 'cancelled', 'failed'].includes(String(job.status))));
const canAdjustRental = computed(() => Boolean(
  activeRental.value?.id &&
  activeRental.value.deadline !== undefined &&
  activeRental.value.deadline_protocol === 1 &&
  activeRental.value.deadline_pending !== true &&
  props.worker?.rental_state === 'active',
));

watch(() => activeRental.value?.id, () => {
  budgetDraft.value = activeRental.value?.budget_usd ?? null;
  reserveDraft.value = activeRental.value?.transfer_reserve_usd ?? null;
}, { immediate: true });

function preparation(job: VastJob): { progress: VastProgress | null; label: string } {
  if (job.preparation_progress) return { progress: job.preparation_progress, label: t('v7optimize.cloudPreparingInput') };
  if (job.image_progress) return { progress: job.image_progress, label: t('v7optimize.cloudPreparingImage') };
  if (job.upload_progress) return { progress: job.upload_progress, label: t('v7optimize.cloudUploadingInput') };
  return { progress: null, label: '' };
}

function completedValue(progress: VastProgress): unknown {
  return progress.bytes ?? progress.files;
}

function totalValue(progress: VastProgress): unknown {
  return progress.total_bytes ?? progress.total_files;
}

function progressLabel(job: VastJob): string {
  const current = preparation(job);
  if (!current.progress) return '';
  const percent = progressPercent(completedValue(current.progress), totalValue(current.progress));
  const stage = String(current.progress.stage || current.progress.status || '').trim();
  return [current.label, percent === null ? t('v7optimize.cloudProgressWaiting') : `${formatMetric(percent, 1)}%`, stage].filter(Boolean).join(' · ');
}

function submitDeadline(direction: -1 | 1): void {
  const rental = activeRental.value;
  const minutes = Math.trunc(Number(deadlineMinutes.value));
  if (!rental || !canAdjustRental.value || !minutes || Math.abs(minutes) > 1440) return;
  emit('adjust-deadline', rental, direction * Math.abs(minutes));
}

function submitBudget(): void {
  const rental = activeRental.value;
  const budget = Number(budgetDraft.value);
  if (rental && Number.isFinite(budget) && budget >= 0.1 && budget <= 100) emit('adjust-budget', rental, budget);
}

function submitReserve(): void {
  const rental = activeRental.value;
  const reserve = Number(reserveDraft.value);
  if (rental && Number.isFinite(reserve) && reserve >= 0.05 && reserve <= 100) emit('adjust-reserve', rental, reserve);
}
</script>

<template>
  <section class="grid gap-3 rounded-md border border-border-subtle bg-page/35 p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-md font-semibold text-primary">{{ t('v7optimize.cloudQueue') }}</h3>
      <span class="text-xs text-secondary">{{ t('v7optimize.cloudActiveJobsCount', { count: activeJobs.length }) }}</span>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="default" :disabled="busy || queuePaused" @click="emit('queue-action', 'pause')">{{ t('v7optimize.cloudPauseQueue') }}</Button>
      <Button type="button" variant="success" :disabled="busy || !queuePaused" @click="emit('queue-action', 'resume')">{{ t('v7optimize.cloudResumeQueue') }}</Button>
      <Button type="button" variant="danger" :disabled="busy || !activeRental" @click="emit('queue-action', 'end')">{{ t('v7optimize.cloudEndRental') }}</Button>
    </div>

    <div v-if="activeRental" class="grid gap-3 rounded-md border border-border-subtle bg-elevated/35 p-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <strong class="text-sm text-primary">{{ activeRental.offer?.gpu_name || t('v7optimize.cloudActiveRental') }}</strong>
          <p class="mt-1 text-xs text-secondary">
            {{ activeRental.offer?.machine_id ? t('v7optimize.cloudMachineNumber', { id: activeRental.offer.machine_id }) : t('v7optimize.cloudMachineUnknown') }}
            · {{ formatMoney(activeRental.offer?.price_hour_usd, 4) }}/h
          </p>
        </div>
        <span v-if="activeRental.deadline" class="text-xs tabular-nums text-secondary">{{ t('v7optimize.cloudRentalDeadline') }}: {{ new Date(activeRental.deadline * 1000).toLocaleString() }}</span>
      </div>

      <div class="grid gap-3 lg:grid-cols-3">
        <div class="grid gap-1.5">
          <Label for="vast-deadline-minutes">{{ t('v7optimize.cloudDeadlineMinutes') }}</Label>
          <div class="flex gap-2">
            <Input id="vast-deadline-minutes" v-model.number="deadlineMinutes" data-test="deadline-minutes" type="number" min="1" max="1440" step="1" />
            <Button type="button" variant="default" size="sm" :disabled="busy || !canAdjustRental" @click="submitDeadline(-1)">-</Button>
            <Button type="button" variant="default" size="sm" data-test="extend-deadline" :disabled="busy || !canAdjustRental" @click="submitDeadline(1)">+</Button>
          </div>
        </div>
        <div class="grid gap-1.5">
          <Label for="vast-rental-budget">{{ t('v7optimize.cloudBudgetTarget') }}</Label>
          <div class="flex gap-2">
            <Input id="vast-rental-budget" v-model.number="budgetDraft" data-test="rental-budget" type="number" min="0.1" max="100" step="0.1" />
            <Button type="button" variant="default" size="sm" data-test="save-rental-budget" :disabled="busy || !canAdjustRental" @click="submitBudget">{{ t('common.save') }}</Button>
          </div>
        </div>
        <div class="grid gap-1.5">
          <Label for="vast-transfer-reserve">{{ t('v7optimize.cloudTransferReserve') }}</Label>
          <div class="flex gap-2">
            <Input id="vast-transfer-reserve" v-model.number="reserveDraft" data-test="transfer-reserve" type="number" min="0.05" max="100" step="0.01" />
            <Button type="button" variant="default" size="sm" data-test="save-transfer-reserve" :disabled="busy || !canAdjustRental" @click="submitReserve">{{ t('common.save') }}</Button>
          </div>
        </div>
      </div>
      <p v-if="activeRental.deadline_pending" class="text-xs text-warning-soft">{{ t('v7optimize.cloudDeadlinePending') }}</p>
      <p v-if="activeRental.deadline_error" class="text-xs text-danger-soft">{{ activeRental.deadline_error }}</p>
    </div>

    <article v-for="job in jobs" :key="job.id" class="grid gap-2 rounded-md border border-border-subtle px-3 py-2 text-sm">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <strong class="block truncate text-primary">{{ job.config_name || job.id }}</strong>
          <span class="text-xs text-secondary">{{ job.status || '-' }}<template v-if="job.cost_estimate?.total_usd !== undefined"> · {{ formatMoney(job.cost_estimate.total_usd) }}</template></span>
        </div>
        <div class="flex flex-wrap gap-1">
          <Button v-if="['failed', 'cancelled'].includes(String(job.status))" type="button" variant="default" size="sm" :disabled="busy" @click="emit('job-action', job, 'requeue')">{{ t('v7optimize.cloudRequeue') }}</Button>
          <Button v-if="!['completed', 'cancelled', 'failed'].includes(String(job.status))" type="button" variant="danger" size="sm" :disabled="busy" @click="emit('job-action', job, 'stop')">{{ t('v7optimize.cloudStop') }}</Button>
          <Button v-if="['failed', 'cancelled'].includes(String(job.status))" type="button" variant="default" size="sm" :disabled="busy" @click="emit('job-action', job, 'recover')">{{ t('v7optimize.cloudRecover') }}</Button>
          <Button v-if="['failed', 'cancelled', 'completed'].includes(String(job.status)) && job.rental && job.rental.id" type="button" variant="warning" size="sm" :disabled="busy" @click="emit('job-action', job, 'cleanup')">{{ t('v7optimize.cloudCleanup') }}</Button>
          <Button v-if="['completed', 'cancelled', 'failed'].includes(String(job.status))" type="button" variant="ghost" size="sm" :disabled="busy || job.can_delete === false" @click="emit('job-action', job, 'delete')">{{ t('common.delete') }}</Button>
        </div>
      </div>

      <div v-if="preparation(job).progress" data-test="job-progress" class="grid gap-1">
        <div class="flex justify-between gap-2 text-xs text-secondary"><span>{{ progressLabel(job) }}</span></div>
        <div class="h-1.5 overflow-hidden rounded-full bg-border-default">
          <div
            class="h-full rounded-full bg-accent transition-[width] duration-300"
            :class="progressPercent(completedValue(preparation(job).progress!), totalValue(preparation(job).progress!)) === null ? 'w-full opacity-40' : ''"
            :style="progressPercent(completedValue(preparation(job).progress!), totalValue(preparation(job).progress!)) === null ? undefined : { width: `${progressPercent(completedValue(preparation(job).progress!), totalValue(preparation(job).progress!))}%` }"
          ></div>
        </div>
      </div>

      <div v-if="job.runtime_metrics" data-test="job-utilization" class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <span class="rounded bg-elevated/35 px-2 py-1 text-secondary">GPU {{ formatMetric(job.runtime_metrics.gpu_percent, 1) }}%</span>
        <span class="rounded bg-elevated/35 px-2 py-1 text-secondary">CPU {{ formatMetric(job.runtime_metrics.cpu_percent, 1) }}%</span>
        <span class="rounded bg-elevated/35 px-2 py-1 text-secondary">RAM {{ formatMetric(Number(job.runtime_metrics.ram_used_bytes) / 1e9, 1) }} GB</span>
        <span class="rounded bg-elevated/35 px-2 py-1 text-secondary">VRAM {{ formatMetric(Number(job.runtime_metrics.vram_used_bytes) / 1e9, 1) }} GB</span>
      </div>

      <div v-if="job.throughput" data-test="job-throughput" class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <span class="rounded bg-elevated/35 px-2 py-1 text-secondary">{{ t('v7optimize.cloudProxyPerMinute') }} {{ formatMetric(job.throughput.proxy_per_minute, 1) }}</span>
        <span class="rounded bg-elevated/35 px-2 py-1 text-secondary">{{ t('v7optimize.cloudExactPerMinute') }} {{ formatMetric(job.throughput.exact_per_minute, 1) }}</span>
        <span class="rounded bg-elevated/35 px-2 py-1 text-secondary">{{ t('v7optimize.cloudProxyTotal') }} {{ formatMetric(job.throughput.proxy_total, 0) }}</span>
        <span class="rounded bg-elevated/35 px-2 py-1 text-secondary">{{ t('v7optimize.cloudExactTotal') }} {{ formatMetric(job.throughput.exact_total, 0) }}</span>
      </div>
      <p v-if="job.error" class="text-xs text-danger-soft">{{ job.error }}</p>
    </article>
  </section>
</template>
