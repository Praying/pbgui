<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { queueVastConfig } from '../lib/vastApi';
import { isOfferCompatible } from '../lib/vastModel';
import type { VastHostProfile } from '../lib/vastTypes';
import VastHostsPanel from './VastHostsPanel.vue';
import VastPerformancePanel from './VastPerformancePanel.vue';
import VastRentalPanel from './VastRentalPanel.vue';

interface VastOffer {
  id?: string | number;
  gpu_name?: string;
  vram_gb?: number;
  ram_gb?: number;
  cpu_cores?: number;
  price_hour_usd?: number;
  location?: string;
  reliability?: number;
  verified?: boolean;
  cuda_max_good?: number;
  duration_seconds?: number;
  machine_id?: number;
  tflops?: number;
  host_history?: VastHostProfile;
  [key: string]: unknown;
}

interface VastRental {
  id?: string;
  deadline?: number;
  budget_usd?: number;
  deadline_protocol?: number;
  deadline_pending?: boolean;
  deadline_error?: string;
  transfer_reserve_usd?: number;
  offer?: { gpu_name?: string; location?: string; price_hour_usd?: number; machine_id?: number };
}

interface VastJob {
  id: string;
  config_name?: string;
  status?: string;
  error?: string;
  cost_estimate?: { total_usd?: number };
  rental?: VastRental;
  [key: string]: unknown;
}

interface VastWorker {
  id?: string;
  rental_state?: string;
  status?: string;
  rental?: VastRental;
  [key: string]: unknown;
}

interface VastPreferences {
  gpu_name: string;
  max_price: number;
  min_vram: number;
  min_ram: number;
  min_cpu: number;
  min_tflops: number;
  disk_gb: number;
  verified_only: boolean;
  hours: number;
  budget: number;
  idle_seconds: 0 | 300;
  max_rentals: number;
  auto_rent: boolean;
  convergence_enabled: boolean;
  convergence_min_exact: number;
  convergence_patience: number;
  convergence_tolerance_pct: number;
}

const { t } = useI18n();
const isOpen = ref(false);
const loading = ref(false);
const saving = ref(false);
const message = ref('');
const error = ref('');
const accountBalance = ref<number | null>(null);
const configs = ref<string[]>([]);
const selectedConfig = ref('');
const iterations = ref(512);
const workers = ref(4);
const useAdg = ref(false);
const offers = ref<VastOffer[]>([]);
const showIncompatible = ref(false);
const selectedOfferId = ref('');
const jobs = ref<VastJob[]>([]);
const worker = ref<VastWorker | null>(null);
const queuePaused = ref(false);
const hosts = ref<VastHostProfile[]>([]);
const blockedMachineIds = ref<number[]>([]);
const activeView = ref<'offers' | 'hosts' | 'performance'>('offers');
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let loadGeneration = 0;
let loadController: AbortController | undefined;

const credentials = reactive({ api_key: '', registry_token: '' });
const preferences = reactive<VastPreferences>({
  gpu_name: '',
  max_price: 0.5,
  min_vram: 12,
  min_ram: 16,
  min_cpu: 4,
  min_tflops: 0,
  disk_gb: 40,
  verified_only: true,
  hours: 1,
  budget: 1,
  idle_seconds: 300,
  max_rentals: 1,
  auto_rent: false,
  convergence_enabled: false,
  convergence_min_exact: 512,
  convergence_patience: 512,
  convergence_tolerance_pct: 0.25,
});

const hasCredentials = ref(false);
const activeJobs = computed(() => jobs.value.filter((job) => !['completed', 'cancelled', 'failed'].includes(String(job.status))));
const workerLabel = computed(() => worker.value?.rental_state || worker.value?.status || t('v7optimize.cloudNoWorker'));
const selectedOffer = computed(() => offers.value.find((offer) => String(offer.id) === selectedOfferId.value) || null);
const selectedOfferCompatible = computed(() => {
  const offer = selectedOffer.value;
  return offer ? isOfferCompatible(offer, preferences.hours) : false;
});
const activeRental = computed(() => {
  const jobRental = jobs.value.find((job) => job.rental)?.rental;
  return jobRental || worker.value?.rental || null;
});

function valueAsNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function applyPreferenceValues(values: Record<string, unknown>): void {
  for (const key of Object.keys(preferences) as Array<keyof VastPreferences>) {
    const value = values[key];
    if (value === undefined) continue;
    if (key === 'idle_seconds') {
      preferences[key] = Number(value) === 0 ? 0 : 300;
    } else if (typeof preferences[key] === 'number') {
      (preferences[key] as number) = valueAsNumber(value, preferences[key] as number);
    } else {
      (preferences[key] as boolean) = Boolean(value);
    }
  }
  preferences.gpu_name = String(values.gpu_name ?? preferences.gpu_name);
}

function preferencePayload(): VastPreferences {
  return { ...preferences, gpu_name: preferences.gpu_name.trim() };
}

async function loadData(): Promise<void> {
  const generation = ++loadGeneration;
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  loading.value = true;
  error.value = '';
  try {
    const [settings, storedPreferences, configData, jobData, hostData] = await Promise.all([
      apiFetch<Record<string, unknown>>('/api/vast/settings', { signal: controller.signal }),
      apiFetch<Record<string, unknown>>('/api/vast/gpu-preferences', { signal: controller.signal }),
      apiFetch<{ configs?: Array<Record<string, unknown>> }>('/api/vast/configs', { signal: controller.signal }),
      apiFetch<{ jobs?: VastJob[]; worker?: VastWorker; queue?: Record<string, unknown> }>('/api/vast/jobs', { signal: controller.signal }),
      apiFetch<{ hosts?: VastHostProfile[] }>('/api/vast/hosts', { signal: controller.signal }),
    ]);
    if (generation !== loadGeneration || controller.signal.aborted) return;
    hasCredentials.value = Boolean(settings.configured);
    applyPreferenceValues(storedPreferences);
    configs.value = (configData.configs ?? []).map((config) => String(config.name ?? '')).filter(Boolean);
    if (!selectedConfig.value || !configs.value.includes(selectedConfig.value)) selectedConfig.value = configs.value[0] || '';
    jobs.value = jobData.jobs ?? [];
    worker.value = jobData.worker ?? null;
    queuePaused.value = Boolean(jobData.queue?.paused);
    blockedMachineIds.value = Array.isArray(jobData.queue?.blocked_machine_ids)
      ? jobData.queue.blocked_machine_ids.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0)
      : [];
    hosts.value = hostData.hosts ?? [];
  } catch (caught) {
    if (!controller.signal.aborted && generation === loadGeneration) error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function runRequest<T>(action: () => Promise<T>, successMessage = ''): Promise<T | undefined> {
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    const result = await action();
    message.value = successMessage;
    await loadData();
    return result;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
    return undefined;
  } finally {
    saving.value = false;
  }
}

async function saveCredential(field: 'api_key' | 'registry_token'): Promise<void> {
  const value = credentials[field].trim();
  if (!value) return;
  const saved = await runRequest(
    () => apiFetch('/api/vast/credentials', { method: 'POST', body: JSON.stringify({ [field]: value }) }),
    t('v7optimize.cloudCredentialSaved'),
  );
  if (saved !== undefined) {
    credentials[field] = '';
    hasCredentials.value = true;
  }
}

async function savePreferences(): Promise<void> {
  await runRequest(
    () => apiFetch('/api/vast/gpu-preferences', { method: 'POST', body: JSON.stringify(preferencePayload()) }),
    t('v7optimize.cloudPreferencesSaved'),
  );
}

async function refreshAccount(): Promise<void> {
  const account = await runRequest(() => apiFetch<{ balance?: number }>('/api/vast/account'), t('v7optimize.cloudAccountRefreshed'));
  if (account?.balance !== undefined) accountBalance.value = valueAsNumber(account.balance, 0);
}

async function findOffers(): Promise<void> {
  const query = new URLSearchParams({
    max_price: String(preferences.max_price),
    min_vram: String(preferences.min_vram),
    min_ram: String(preferences.min_ram),
    min_cpu: String(preferences.min_cpu),
    min_tflops: String(preferences.min_tflops),
    disk_gb: String(preferences.disk_gb),
    verified_only: String(preferences.verified_only),
    gpu_name: preferences.gpu_name.trim(),
    include_incompatible: String(showIncompatible.value),
    rental_hours: String(preferences.hours),
  });
  const result = await runRequest(() => apiFetch<{ offers?: VastOffer[]; hosts?: VastHostProfile[] }>(`/api/vast/offers?${query}`), t('v7optimize.cloudOffersLoaded'));
  offers.value = result?.offers ?? [];
  if (result?.hosts) hosts.value = result.hosts;
  selectedOfferId.value = '';
}

async function prepareJob(): Promise<void> {
  if (!selectedConfig.value) return;
  await runRequest(
    () => apiFetch('/api/vast/jobs/prepare', { method: 'POST', body: JSON.stringify({ config_name: selectedConfig.value, iterations: iterations.value, workers: workers.value, use_adg: useAdg.value }) }),
    t('v7optimize.cloudJobQueued'),
  );
}

async function queueConfig(configName: string, config: Record<string, unknown>): Promise<void> {
  await queueVastConfig(configName, config, iterations.value, workers.value, useAdg.value);
  message.value = t('v7optimize.cloudJobQueued');
  await loadData();
}

async function startQueue(): Promise<void> {
  await runRequest(
    () => apiFetch('/api/vast/queue/start', { method: 'POST', body: JSON.stringify({ use_saved_settings: true, accept_rental_and_cleanup: true }) }),
    t('v7optimize.cloudQueueStarted'),
  );
}

async function rentSelectedOffer(): Promise<void> {
  const offer = selectedOffer.value;
  if (!offer || !selectedOfferCompatible.value) return;
  await runRequest(
    () => apiFetch('/api/vast/queue/start', {
      method: 'POST',
      body: JSON.stringify({
        use_saved_settings: true,
        accept_rental_and_cleanup: true,
        rent_only: true,
        offer_id: Number(offer.id),
      }),
    }),
    t('v7optimize.cloudRentalStarted'),
  );
  selectedOfferId.value = '';
}

async function adjustDeadline(rental: VastRental, minutes: number): Promise<void> {
  if (!rental.id || rental.deadline === undefined || !Number.isInteger(minutes) || minutes === 0) return;
  await runRequest(() => apiFetch('/api/vast/queue/deadline', {
      method: 'POST',
      body: JSON.stringify({ worker_id: rental.id, expected_deadline: rental.deadline, minutes }),
    }), t('v7optimize.cloudQueueUpdated'));
}

async function adjustBudget(rental: VastRental, budget: number): Promise<void> {
  if (!rental.id || rental.budget_usd === undefined) return;
  await runRequest(() => apiFetch('/api/vast/queue/budget', {
    method: 'POST',
    body: JSON.stringify({ worker_id: rental.id, expected_budget_usd: rental.budget_usd, budget_usd: budget }),
  }), t('v7optimize.cloudQueueUpdated'));
}

async function adjustReserve(rental: VastRental, reserve: number): Promise<void> {
  if (!rental.id || rental.transfer_reserve_usd === undefined) return;
  await runRequest(() => apiFetch('/api/vast/queue/transfer-reserve', {
    method: 'POST',
    body: JSON.stringify({ worker_id: rental.id, expected_reserve_usd: rental.transfer_reserve_usd, reserve_usd: reserve }),
  }), t('v7optimize.cloudQueueUpdated'));
}

async function queueAction(action: 'pause' | 'resume' | 'end'): Promise<void> {
  await runRequest(() => apiFetch(`/api/vast/queue/${action}`, { method: 'POST' }), t('v7optimize.cloudQueueUpdated'));
}

async function jobAction(job: VastJob, action: 'stop' | 'recover' | 'requeue' | 'cleanup' | 'delete'): Promise<void> {
  await runRequest(() => apiFetch(`/api/vast/jobs/${encodeURIComponent(job.id)}/${action}`, { method: action === 'delete' ? 'DELETE' : 'POST' }), t('v7optimize.cloudJobUpdated'));
}

async function setHostBlock(machineId: number, blocked: boolean): Promise<void> {
  const result = await runRequest(() => apiFetch<{ blocked_machine_ids?: number[] }>('/api/vast/blocked-hosts', {
    method: 'POST',
    body: JSON.stringify({ machine_id: machineId, blocked }),
  }), t('v7optimize.cloudHostUpdated'));
  if (result?.blocked_machine_ids) blockedMachineIds.value = result.blocked_machine_ids;
}

async function setHostPreference(machineId: number, field: 'preferred' | 'working', value: boolean): Promise<void> {
  const result = await runRequest(() => apiFetch<{ hosts?: VastHostProfile[] }>('/api/vast/host-preferences', {
    method: 'POST',
    body: JSON.stringify({ machine_id: machineId, [field]: value }),
  }), t('v7optimize.cloudHostUpdated'));
  if (result?.hosts) hosts.value = result.hosts;
}

function formatMoney(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(3)}` : '-';
}

onMounted(() => {
  void loadData();
  refreshTimer = setInterval(() => { if (isOpen.value) void loadData(); }, 15000);
});
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  loadGeneration += 1;
  loadController?.abort();
});
</script>

<template>
  <details class="rounded-lg border border-border-subtle bg-panel shadow-panel" @toggle="isOpen = ($event.target as HTMLDetailsElement).open">
    <summary class="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-border-subtle px-3 py-2.5 text-sm font-semibold text-primary">
      <span>{{ t('v7optimize.cloudGpuTitle') }}</span>
      <span class="text-xs font-normal text-secondary">{{ workerLabel }}</span>
    </summary>
    <div class="grid gap-4 p-3">
      <p v-if="error" class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-soft" role="alert">{{ error }}</p>
      <p v-if="message" class="rounded-md border border-success/35 bg-success/10 px-3 py-2 text-sm text-success-soft" role="status">{{ message }}</p>

      <nav class="flex flex-wrap gap-2" :aria-label="t('v7optimize.cloudViews')">
        <Button type="button" :variant="activeView === 'offers' ? 'info' : 'ghost'" size="sm" @click="activeView = 'offers'">{{ t('v7optimize.cloudOffersAndQueue') }}</Button>
        <Button type="button" :variant="activeView === 'hosts' ? 'info' : 'ghost'" size="sm" @click="activeView = 'hosts'">{{ t('v7optimize.cloudHostManagement') }}</Button>
        <Button type="button" :variant="activeView === 'performance' ? 'info' : 'ghost'" size="sm" @click="activeView = 'performance'">{{ t('v7optimize.cloudPerformanceHistory') }}</Button>
      </nav>

      <section v-if="activeView === 'offers'" class="grid gap-3 rounded-md border border-border-subtle bg-page/35 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-md font-semibold text-primary">{{ t('v7optimize.cloudAccount') }}</h3>
          <Button type="button" variant="default" size="sm" :disabled="saving || !hasCredentials" @click="refreshAccount">{{ t('v7optimize.cloudRefreshBalance') }}</Button>
        </div>
        <p class="text-xs text-secondary">{{ hasCredentials ? t('v7optimize.cloudCredentialsConfigured') : t('v7optimize.cloudCredentialsMissing') }}</p>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="grid gap-1.5"><Label for="vast-api-key">{{ t('v7optimize.cloudApiKey') }}</Label><div class="flex gap-2"><Input id="vast-api-key" v-model="credentials.api_key" type="password" autocomplete="off" /><Button type="button" variant="default" size="sm" :disabled="saving || !credentials.api_key" @click="saveCredential('api_key')">{{ t('common.save') }}</Button></div></div>
          <div class="grid gap-1.5"><Label for="vast-registry-token">{{ t('v7optimize.cloudRegistryToken') }}</Label><div class="flex gap-2"><Input id="vast-registry-token" v-model="credentials.registry_token" type="password" autocomplete="off" /><Button type="button" variant="default" size="sm" :disabled="saving || !credentials.registry_token" @click="saveCredential('registry_token')">{{ t('common.save') }}</Button></div></div>
        </div>
        <strong v-if="accountBalance !== null" class="text-sm text-primary">{{ t('v7optimize.cloudBalance') }}: {{ formatMoney(accountBalance) }}</strong>
      </section>

      <section v-if="activeView === 'offers'" class="grid gap-3 rounded-md border border-border-subtle bg-page/35 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="text-md font-semibold text-primary">{{ t('v7optimize.cloudPreferences') }}</h3><Button type="button" variant="default" size="sm" :disabled="saving" @click="savePreferences">{{ t('common.save') }}</Button></div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="grid gap-1.5 lg:col-span-2"><Label for="vast-gpu-name">{{ t('v7optimize.cloudGpuName') }}</Label><Input id="vast-gpu-name" v-model="preferences.gpu_name" /></div>
          <div class="grid gap-1.5"><Label for="vast-max-price">{{ t('v7optimize.cloudMaxPrice') }}</Label><Input id="vast-max-price" v-model.number="preferences.max_price" type="number" min="0.01" step="0.01" /></div>
          <div class="grid gap-1.5"><Label for="vast-hours">{{ t('v7optimize.cloudHours') }}</Label><Input id="vast-hours" v-model.number="preferences.hours" type="number" min="0.25" step="0.25" /></div>
          <div class="grid gap-1.5"><Label for="vast-min-vram">{{ t('v7optimize.cloudMinVram') }}</Label><Input id="vast-min-vram" v-model.number="preferences.min_vram" type="number" min="0" /></div>
          <div class="grid gap-1.5"><Label for="vast-min-ram">{{ t('v7optimize.cloudMinRam') }}</Label><Input id="vast-min-ram" v-model.number="preferences.min_ram" type="number" min="0" /></div>
          <div class="grid gap-1.5"><Label for="vast-min-cpu">{{ t('v7optimize.cloudMinCpu') }}</Label><Input id="vast-min-cpu" v-model.number="preferences.min_cpu" type="number" min="0" /></div>
          <div class="grid gap-1.5"><Label for="vast-min-tflops">{{ t('v7optimize.cloudMinTflops') }}</Label><Input id="vast-min-tflops" v-model.number="preferences.min_tflops" type="number" min="0" step="0.1" /></div>
          <div class="grid gap-1.5"><Label for="vast-disk">{{ t('v7optimize.cloudDiskGb') }}</Label><Input id="vast-disk" v-model.number="preferences.disk_gb" type="number" min="40" /></div>
          <div class="grid gap-1.5"><Label for="vast-max-rentals">{{ t('v7optimize.cloudMaxRentals') }}</Label><Input id="vast-max-rentals" v-model.number="preferences.max_rentals" type="number" min="1" max="16" step="1" /></div>
        </div>
        <label class="flex items-center gap-2 text-sm text-secondary"><Checkbox v-model="preferences.verified_only" />{{ t('v7optimize.cloudVerifiedOnly') }}</label>
        <label class="flex items-center gap-2 text-sm text-secondary"><Checkbox v-model="preferences.auto_rent" />{{ t('v7optimize.cloudAutoRent') }}</label>
        <div class="flex flex-wrap gap-2"><Button type="button" variant="default" :disabled="saving || !hasCredentials" @click="findOffers">{{ t('v7optimize.cloudFindOffers') }}</Button><Button type="button" variant="default" :disabled="saving || !selectedConfig" @click="prepareJob">{{ t('v7optimize.cloudQueueJob') }}</Button><Button type="button" variant="warning" :disabled="saving || !selectedOfferCompatible" @click="rentSelectedOffer">{{ t('v7optimize.cloudRentSelected') }}</Button></div>
      </section>

      <section v-if="activeView === 'offers' && offers.length" class="grid gap-2 rounded-md border border-border-subtle bg-page/35 p-3">
        <div class="flex items-center justify-between gap-2"><h3 class="text-md font-semibold text-primary">{{ t('v7optimize.cloudOffers') }}</h3><label class="flex items-center gap-2 text-xs text-secondary"><Checkbox v-model="showIncompatible" />{{ t('v7optimize.cloudShowIncompatible') }}</label></div>
        <div class="max-h-64 overflow-auto rounded-md border border-border-subtle"><table class="w-full min-w-[760px] text-left text-xs"><thead class="sticky top-0 bg-panel text-secondary"><tr><th class="p-2">{{ t('v7optimize.cloudGpuName') }}</th><th class="p-2">{{ t('v7optimize.cloudVram') }}</th><th class="p-2">TFLOPS</th><th class="p-2">{{ t('v7optimize.cloudPrice') }}</th><th class="p-2">{{ t('v7optimize.cloudLocation') }}</th><th class="p-2">{{ t('v7optimize.cloudHostHistory') }}</th><th class="p-2">{{ t('v7backtest.actions') }}</th></tr></thead><tbody><tr v-for="offer in offers" :key="String(offer.id)" class="cursor-pointer border-t border-border-subtle" :class="selectedOfferId === String(offer.id) ? 'bg-accent/10 border-l-[3px] border-l-accent' : ''" :aria-selected="selectedOfferId === String(offer.id)" tabindex="0" @click="selectedOfferId = String(offer.id)" @keydown.enter.prevent="selectedOfferId = String(offer.id)" @keydown.space.prevent="selectedOfferId = String(offer.id)"><td class="p-2">{{ offer.gpu_name || '-' }}</td><td class="p-2">{{ offer.vram_gb ?? '-' }} GB</td><td class="p-2">{{ offer.tflops ?? '-' }}</td><td class="p-2">{{ formatMoney(offer.price_hour_usd) }}/h</td><td class="p-2">{{ offer.location || '-' }}<span v-if="offer.machine_id" class="block text-micro text-muted">{{ t('v7optimize.cloudMachineNumber', { id: offer.machine_id }) }}</span></td><td class="p-2">{{ offer.host_history?.working ? t('v7optimize.cloudHostWorking') : offer.host_history?.used ? t('v7optimize.cloudHostPreviouslyUsed') : t('v7optimize.cloudHostNoRecordedUse') }}<span v-if="offer.host_history?.preferred" class="block text-micro text-accent-soft">{{ t('v7optimize.cloudHostPreferred') }}</span></td><td class="p-2"><div v-if="offer.machine_id" class="flex gap-1"><Button type="button" variant="ghost" size="sm" :disabled="saving" @click.stop="setHostPreference(offer.machine_id, 'preferred', !offer.host_history?.preferred)">{{ offer.host_history?.preferred ? t('v7optimize.cloudRemovePreference') : t('v7optimize.cloudPreferHost') }}</Button><Button type="button" variant="danger" size="sm" :disabled="saving" @click.stop="setHostBlock(offer.machine_id, true)">{{ t('v7optimize.cloudBlockHost') }}</Button></div></td></tr></tbody></table></div>
      </section>

      <section v-if="activeView === 'offers'" class="grid gap-3 rounded-md border border-border-subtle bg-page/35 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="text-md font-semibold text-primary">{{ t('v7optimize.cloudQueue') }}</h3><span class="text-xs text-secondary">{{ activeJobs.length }} {{ t('v7optimize.cloudActiveJobs') }}</span></div>
        <div class="grid gap-3 sm:grid-cols-3"><div class="grid gap-1.5 sm:col-span-2"><Label>{{ t('v7optimize.cloudConfig') }}</Label><SelectRoot v-model="selectedConfig"><SelectTrigger><span>{{ selectedConfig || t('v7optimize.cloudSelectConfig') }}</span></SelectTrigger><SelectContent><SelectItem v-for="config in configs" :key="config" :value="config">{{ config }}</SelectItem></SelectContent></SelectRoot></div><div class="grid gap-1.5"><Label for="vast-iterations">{{ t('v7optimize.cloudIterations') }}</Label><Input id="vast-iterations" v-model.number="iterations" type="number" min="256" /></div></div>
        <div class="flex flex-wrap gap-2"><Button type="button" variant="success" :disabled="saving || !configs.length" @click="startQueue">{{ t('v7optimize.cloudStartQueue') }}</Button></div>
        <div v-if="loading" class="text-xs text-secondary">{{ t('common.loading') }}</div>
      </section>
      <VastRentalPanel v-if="activeView === 'offers'" :jobs="jobs" :worker="worker" :queue-paused="queuePaused" :busy="saving" @queue-action="queueAction" @job-action="jobAction" @adjust-deadline="adjustDeadline" @adjust-budget="adjustBudget" @adjust-reserve="adjustReserve" />
      <VastHostsPanel v-if="activeView === 'hosts'" :hosts="hosts" :blocked-machine-ids="blockedMachineIds" :busy="saving" @set-preference="setHostPreference" @set-block="setHostBlock" />
      <VastPerformancePanel :active="isOpen && activeView === 'performance'" :class="activeView === 'performance' ? '' : 'hidden'" />
    </div>
  </details>
</template>
