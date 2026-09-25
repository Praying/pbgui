<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
import AppShell from '@/shared/components/AppShell.vue';
import { Input } from '@/shared/components/ui/input';

const { t } = useI18n();

type HyperliquidBot = { name?: string; host?: string; pb_version?: string };
type HyperliquidAccount = {
  users?: string[];
  bots?: HyperliquidBot[];
  used?: number;
  cap?: number;
  sampled_at?: number;
  state?: string;
  source?: string;
};
type HistorySample = { sampled_at: number; used: number; cap: number };

const accounts = ref<HyperliquidAccount[]>([]);
const selectedAccount = ref('');
const filterText = ref('');
const loading = ref(true);
const errorMessage = ref('');
const historyLoading = ref(false);
const historySamples = ref<HistorySample[]>([]);
let refreshTimer: number | null = null;
let requestGeneration = 0;
let historyGeneration = 0;

const filteredAccounts = computed(() => {
  const filter = filterText.value.trim().toLowerCase();
  if (!filter) return accounts.value;
  return accounts.value.filter((account) => {
    const users = account.users || [];
    const bots = account.bots || [];
    return [...users, ...bots.map((bot) => `${bot.name || ''} ${bot.host || ''}`)].join(' ').toLowerCase().includes(filter);
  });
});

const activeWalletCount = computed(() => accounts.value.filter((account) => (account.bots || []).length > 0).length);
const selected = computed(() => accounts.value.find((account) => (account.users || []).includes(selectedAccount.value)) || null);

function formatRequestCount(value: unknown): string {
  if (!Number.isInteger(value)) return '—';
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function formatTime(value: unknown): string {
  return Number.isInteger(value) && Number(value) > 0 ? new Date(Number(value) * 1000).toLocaleString() : '—';
}

function updateUrl(): void {
  const url = new URL(window.location.href);
  if (selectedAccount.value) url.searchParams.set('account', selectedAccount.value);
  else url.searchParams.delete('account');
  if (filterText.value) url.searchParams.set('filter', filterText.value);
  else url.searchParams.delete('filter');
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function selectAccount(accountName: string): void {
  selectedAccount.value = selectedAccount.value === accountName ? '' : accountName;
  historySamples.value = [];
  updateUrl();
  if (selectedAccount.value) void loadHistory(selectedAccount.value);
}

function getStatus(account: HyperliquidAccount): string {
  if (account.source === 'purchase') return t('misc.hlLimits.purchaseCheck');
  if (account.state === 'on_demand') return t('misc.hlLimits.oneTimeRead');
  if (!(account.bots || []).length) return t('misc.hlLimits.notSampled');
  if (account.state === 'ok') return t('misc.hlLimits.liveOnVps');
  if (account.state === 'stale') return t('misc.hlLimits.staleSample');
  return t('misc.hlLimits.waitingSample');
}

function getStatusClass(account: HyperliquidAccount): string {
  if (account.state === 'ok') return 'text-success';
  if (account.state === 'idle' || account.state === 'on_demand') return 'text-secondary';
  return 'text-warning-soft';
}

async function loadAccounts(): Promise<void> {
  const generation = ++requestGeneration;
  loading.value = accounts.value.length === 0;
  try {
    const payload = await apiFetch<{ accounts?: HyperliquidAccount[] }>('/api/vps-manager/user-rate-limits');
    if (generation !== requestGeneration) return;
    accounts.value = Array.isArray(payload.accounts) ? payload.accounts : [];
    if (selectedAccount.value && !selected.value) selectedAccount.value = '';
    errorMessage.value = '';
  } catch (error) {
    if (generation === requestGeneration) errorMessage.value = error instanceof Error ? error.message : t('misc.hlLimits.loadFailed');
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

async function loadHistory(accountName: string): Promise<void> {
  const generation = ++historyGeneration;
  historyLoading.value = true;
  try {
    const payload = await apiFetch<{ samples?: HistorySample[] }>(`/api/vps-manager/user-rate-limits/history/${encodeURIComponent(accountName)}`);
    if (generation !== historyGeneration || selectedAccount.value !== accountName) return;
    historySamples.value = Array.isArray(payload.samples) ? payload.samples : [];
  } catch {
    if (generation === historyGeneration) historySamples.value = [];
  } finally {
    if (generation === historyGeneration) historyLoading.value = false;
  }
}

function historyPoints(field: 'used' | 'cap'): string {
  if (!historySamples.value.length) return '';
  const maximum = Math.max(1, ...historySamples.value.map((sample) => Math.max(sample.used, sample.cap)));
  const first = historySamples.value[0]?.sampled_at ?? 0;
  const last = historySamples.value[historySamples.value.length - 1]?.sampled_at ?? first;
  return historySamples.value.map((sample) => {
    const x = historySamples.value.length === 1 ? 450 : 20 + 860 * ((sample.sampled_at - first) / Math.max(1, last - first));
    const y = 190 - 160 * (sample[field] / maximum);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function handleVisibilityChange(): void {
  if (!document.hidden) void loadAccounts();
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  selectedAccount.value = params.get('account') || '';
  filterText.value = params.get('filter') || '';
  document.title = t('misc.hlLimits.title');
  document.addEventListener('visibilitychange', handleVisibilityChange);
  refreshTimer = window.setInterval(() => { if (!document.hidden) void loadAccounts(); }, 30_000);
  void loadAccounts().then(() => { if (selectedAccount.value) void loadHistory(selectedAccount.value); });
});

onUnmounted(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  requestGeneration += 1;
  historyGeneration += 1;
});
</script>

<template>
  <AppShell page-key="info_hl_limits" :page-title="t('misc.hlLimits.title')" class="data-page-shell data-page-shell--hl-limits">
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-[var(--page-padding)]">
      <p class="m-0 max-w-4xl text-sm leading-relaxed text-secondary">{{ t('misc.hlLimits.description') }}</p>
      <div class="flex flex-wrap gap-2">
        <span class="rounded-full border border-border-default bg-card px-3 py-1.5 text-sm text-secondary">{{ t('misc.hlLimits.walletCount', { count: accounts.length }) }}</span>
        <span class="rounded-full border border-border-default bg-card px-3 py-1.5 text-sm text-secondary">{{ t('misc.hlLimits.activeCount', { count: activeWalletCount }) }}</span>
        <span class="rounded-full border border-border-default bg-card px-3 py-1.5 text-sm text-secondary">{{ t('misc.hlLimits.idleCount', { count: accounts.length - activeWalletCount }) }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Input v-model="filterText" :placeholder="t('misc.hlLimits.filterPlaceholder')" :aria-label="t('misc.hlLimits.filterLabel')" class="w-full max-w-md" @input="updateUrl" />
        <span class="text-xs text-secondary">{{ t('misc.hlLimits.autoUpdate') }}</span>
      </div>
      <div v-if="loading" class="h-48 animate-pulse rounded-lg border border-border-default bg-card" />
      <div v-else-if="errorMessage" class="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{{ errorMessage }}</div>
      <div v-else class="overflow-auto rounded-lg border border-border-default">
        <table class="min-w-[900px] w-full border-separate border-spacing-0 text-sm">
          <thead class="sticky top-0 z-10 bg-page"><tr>
            <th v-for="heading in ['account', 'runningBots', 'used', 'cap', 'remaining', 'usage', 'lastSample', 'status']" :key="heading" class="border-b-2 border-border-default px-3 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t(`misc.hlLimits.${heading}`) }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="account in filteredAccounts" :key="(account.users || []).join('|')" class="cursor-pointer hover:bg-secondary/5" :class="selectedAccount && (account.users || []).includes(selectedAccount) ? 'bg-accent/10' : ''" tabindex="0" @click="selectAccount(String((account.users || [])[0] || ''))" @keydown.enter="selectAccount(String((account.users || [])[0] || ''))">
              <td class="border-b border-border-subtle px-3 py-2.5 align-top"><strong class="text-primary">{{ (account.users || []).join(', ') || t('misc.hlLimits.unknown') }}</strong><div class="mt-1 text-xs text-secondary">{{ (account.bots || []).length ? t('misc.hlLimits.sharedWallet') : t('misc.hlLimits.noRunningBot') }}</div></td>
              <td class="border-b border-border-subtle px-3 py-2.5 align-top">{{ (account.bots || []).map((bot) => `${bot.pb_version === '8' ? 'PB8' : 'PB7'} ${bot.name || ''} · ${bot.host || ''}`).join('; ') || '—' }}</td>
              <td class="border-b border-border-subtle px-3 py-2.5 align-top">{{ formatRequestCount(account.used) }}</td>
              <td class="border-b border-border-subtle px-3 py-2.5 align-top">{{ formatRequestCount(account.cap) }}</td>
              <td class="border-b border-border-subtle px-3 py-2.5 align-top" :class="account.used !== undefined && account.cap !== undefined && account.used >= account.cap ? 'text-danger' : 'text-success'">{{ account.used !== undefined && account.cap !== undefined ? formatRequestCount(Math.max(0, account.cap - account.used)) : '—' }}</td>
              <td class="border-b border-border-subtle px-3 py-2.5 align-top">{{ account.used !== undefined && account.cap ? `${(100 * account.used / account.cap).toFixed(1)}%` : '—' }}</td>
              <td class="border-b border-border-subtle px-3 py-2.5 align-top">{{ formatTime(account.sampled_at) }}</td>
              <td class="border-b border-border-subtle px-3 py-2.5 align-top" :class="getStatusClass(account)">{{ getStatus(account) }}</td>
            </tr>
            <tr v-if="filteredAccounts.length === 0"><td colspan="8" class="px-3 py-8 text-center text-sm text-secondary">{{ accounts.length ? t('misc.hlLimits.noMatches') : t('misc.hlLimits.noWallets') }}</td></tr>
          </tbody>
        </table>
      </div>
      <section v-if="selected" class="rounded-lg border border-border-default bg-panel p-4">
        <h2 class="m-0 text-md font-semibold tracking-tight text-primary">{{ selectedAccount }} · {{ t('misc.hlLimits.historyTitle') }}</h2>
        <p v-if="historyLoading" class="mb-0 mt-2 text-sm text-secondary">{{ t('misc.hlLimits.loadingHistory') }}</p>
        <p v-else-if="!historySamples.length" class="mb-0 mt-2 text-sm text-secondary">{{ t('misc.hlLimits.noHistory') }}</p>
        <template v-else>
          <p class="mb-2 mt-1 text-xs text-secondary">{{ t('misc.hlLimits.sampleSummary', { count: historySamples.length, first: formatTime(historySamples[0]?.sampled_at), last: formatTime(historySamples[historySamples.length - 1]?.sampled_at) }) }}</p>
          <svg viewBox="0 0 900 220" class="h-56 w-full rounded-md bg-page" role="img" :aria-label="t('misc.hlLimits.historyTitle')"><polyline :points="historyPoints('cap')" fill="none" stroke="var(--warning-soft)" stroke-width="3" /><polyline :points="historyPoints('used')" fill="none" stroke="var(--accent-soft)" stroke-width="3" /></svg>
          <div class="mt-2 flex gap-5 text-xs text-secondary"><span class="text-accent-soft">{{ t('misc.hlLimits.used') }}</span><span class="text-warning-soft">{{ t('misc.hlLimits.cap') }}</span></div>
        </template>
      </section>
    </div>
  </AppShell>
</template>
