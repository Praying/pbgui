<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhArrowsClockwise, PhRobot, PhWallet } from '@phosphor-icons/vue';
import { apiFetch } from '@/shared/api';
import AppShell from '@/shared/components/AppShell.vue';
import EmptyState from '@/shared/components/EmptyState.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import { Input } from '@/shared/components/ui/input';
import { ChartFrame, MetricBlock } from '@/shared/components/ui/workbench-primitives';
import { EmptyRow, ListFooter, ListWrap, Table, Th } from '@/shared/components/ui/table';

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

const columns = [
  { key: 'account', align: 'left' },
  { key: 'runningBots', align: 'left' },
  { key: 'used', align: 'right' },
  { key: 'cap', align: 'right' },
  { key: 'remaining', align: 'right' },
  { key: 'usage', align: 'right' },
  { key: 'lastSample', align: 'left' },
  { key: 'status', align: 'left' },
] as const;

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
const idleWalletCount = computed(() => accounts.value.length - activeWalletCount.value);
const selected = computed(() => accounts.value.find((account) => (account.users || []).includes(selectedAccount.value)) || null);

/* 24-hour chart drops before the first sample arrives; the frame state drives
   the shared chart chrome while the panel body owns the actual content. */
const historyState = computed<'ready' | 'loading' | 'empty'>(() => {
  if (historyLoading.value) return 'loading';
  return historySamples.value.length ? 'ready' : 'empty';
});

const historySummary = computed(() => (
  historySamples.value.length
    ? t('misc.hlLimits.sampleSummary', {
        count: historySamples.value.length,
        first: formatTime(historySamples.value[0]?.sampled_at),
        last: formatTime(historySamples.value[historySamples.value.length - 1]?.sampled_at),
      })
    : undefined
));

function formatRequestCount(value: unknown): string {
  if (!Number.isInteger(value)) return '—';
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function formatTime(value: unknown): string {
  return Number.isInteger(value) && Number(value) > 0 ? new Date(Number(value) * 1000).toLocaleString() : '—';
}

function accountUsers(account: HyperliquidAccount): string {
  return (account.users || []).join(', ') || t('misc.hlLimits.unknown');
}

function accountKey(account: HyperliquidAccount): string {
  return (account.users || []).join('|');
}

function isAccountSelected(account: HyperliquidAccount): boolean {
  return Boolean(selectedAccount.value && (account.users || []).includes(selectedAccount.value));
}

function botSummary(account: HyperliquidAccount): string {
  return (account.bots || [])
    .map((bot) => `${bot.pb_version === '8' ? 'PB8' : 'PB7'} ${bot.name || ''} · ${bot.host || ''}`.trim())
    .join('; ');
}

function remainingRequestCount(account: HyperliquidAccount): string {
  if (account.used === undefined || account.cap === undefined) return '—';
  return formatRequestCount(Math.max(0, account.cap - account.used));
}

function isCapacityExhausted(account: HyperliquidAccount): boolean {
  return account.used !== undefined && account.cap !== undefined && account.used >= account.cap;
}

function usageRatio(account: HyperliquidAccount): number | null {
  if (account.used === undefined || !account.cap) return null;
  return Math.min(1, Math.max(0, account.used / account.cap));
}

function usageText(account: HyperliquidAccount): string {
  const ratio = usageRatio(account);
  return ratio === null ? '—' : `${(100 * ratio).toFixed(1)}%`;
}

function usageBarWidth(account: HyperliquidAccount): string {
  return `${((usageRatio(account) ?? 0) * 100).toFixed(1)}%`;
}

function usageBarTone(account: HyperliquidAccount): string {
  const ratio = usageRatio(account);
  if (ratio === null) return 'bg-border-strong';
  if (ratio >= 1) return 'bg-danger';
  if (ratio >= 0.8) return 'bg-warning';
  return 'bg-accent';
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
    <div class="flex min-h-0 w-full flex-1 flex-col gap-[var(--component-gap)] overflow-y-auto p-[var(--page-padding)]">

      <p class="m-0 max-w-[72ch] text-sm leading-relaxed text-secondary">{{ t('misc.hlLimits.description') }}</p>

      <div class="grid w-full max-w-[760px] grid-cols-[repeat(3,minmax(0,1fr))] gap-3 max-[720px]:grid-cols-1">
        <MetricBlock :label="t('misc.hlLimits.walletsLabel')" :value="accounts.length" tone="info" />
        <MetricBlock :label="t('misc.hlLimits.activeLabel')" :value="activeWalletCount" tone="success" />
        <MetricBlock :label="t('misc.hlLimits.idleLabel')" :value="idleWalletCount" />
      </div>

      <LoadingSkeleton v-if="loading" :label="t('common.loading')" :lines="5" />

      <ErrorState
        v-else-if="errorMessage"
        :title="t('misc.hlLimits.loadFailed')"
        :message="errorMessage"
      />

      <section v-else class="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border-default bg-panel">
        <div class="pbgui-list-toolbar flex flex-wrap items-center gap-3 border-b border-border-subtle px-3 py-2.5">
          <Input
            v-model="filterText"
            :placeholder="t('misc.hlLimits.filterPlaceholder')"
            :aria-label="t('misc.hlLimits.filterLabel')"
            class="w-full max-w-[420px]"
            @input="updateUrl"
          />
          <span class="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
            <PbIcon :icon="PhArrowsClockwise" :size="14" />
            {{ t('misc.hlLimits.autoUpdate') }}
          </span>
        </div>

        <ListWrap class="min-h-[220px] max-h-[min(62dvh,760px)] overflow-auto">
          <Table class="min-w-[1040px]">
            <thead>
              <tr>
                <Th
                  v-for="column in columns"
                  :key="column.key"
                  :align="column.align"
                >{{ t(`misc.hlLimits.${column.key}`) }}</Th>
              </tr>
            </thead>
            <tbody>
              <EmptyRow
                v-if="!filteredAccounts.length"
                size="inline"
                :colspan="columns.length"
                :icon="PhWallet"
                :title="accounts.length ? t('misc.hlLimits.noMatches') : t('misc.hlLimits.noWallets')"
              />
              <tr
                v-for="account in filteredAccounts"
                v-else
                :key="accountKey(account)"
                class="cursor-pointer"
                :class="{ selected: isAccountSelected(account) }"
                tabindex="0"
                @click="selectAccount(String((account.users || [])[0] || ''))"
                @keydown.enter="selectAccount(String((account.users || [])[0] || ''))"
                @keydown.space.prevent="selectAccount(String((account.users || [])[0] || ''))"
              >
                <td class="align-top">
                  <strong class="text-primary">{{ accountUsers(account) }}</strong>
                  <div class="mt-1 text-xs text-secondary">
                    {{ (account.bots || []).length ? t('misc.hlLimits.sharedWallet') : t('misc.hlLimits.noRunningBot') }}
                  </div>
                </td>
                <td class="align-top text-secondary">
                  <span v-if="botSummary(account)" class="inline-flex flex-wrap items-center gap-1.5">
                    <PbIcon :icon="PhRobot" :size="14" class="shrink-0 text-muted" />
                    <span>{{ botSummary(account) }}</span>
                  </span>
                  <span v-else>—</span>
                </td>
                <td class="align-top text-right tabular-nums">{{ formatRequestCount(account.used) }}</td>
                <td class="align-top text-right tabular-nums">{{ formatRequestCount(account.cap) }}</td>
                <td
                  class="align-top text-right font-medium tabular-nums"
                  :class="isCapacityExhausted(account) ? 'text-danger' : 'text-success'"
                >{{ remainingRequestCount(account) }}</td>
                <td class="align-top">
                  <div class="flex items-center justify-end gap-2">
                    <span class="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-border-subtle" aria-hidden="true">
                      <span class="block h-full rounded-full" :class="usageBarTone(account)" :style="{ width: usageBarWidth(account) }" />
                    </span>
                    <span class="w-12 text-right tabular-nums">{{ usageText(account) }}</span>
                  </div>
                </td>
                <td class="align-top whitespace-nowrap text-secondary">{{ formatTime(account.sampled_at) }}</td>
                <td class="align-top whitespace-nowrap" :class="getStatusClass(account)">{{ getStatus(account) }}</td>
              </tr>
            </tbody>
          </Table>
        </ListWrap>

        <ListFooter>
          <span>{{ t('misc.hlLimits.walletCount', { count: filteredAccounts.length }) }}</span>
          <span v-if="filteredAccounts.length !== accounts.length">{{ t('misc.hlLimits.walletCount', { count: accounts.length }) }}</span>
        </ListFooter>
      </section>

      <ChartFrame
        v-if="selected"
        :title="`${selectedAccount} · ${t('misc.hlLimits.historyTitle')}`"
        :description="historySummary"
        :state="historyState"
      >
        <LoadingSkeleton v-if="historyLoading" :label="t('misc.hlLimits.loadingHistory')" :lines="3" />
        <EmptyState
          v-else-if="!historySamples.length"
          size="inline"
          :title="t('misc.hlLimits.noHistory')"
        />
        <template v-else>
          <svg viewBox="0 0 900 220" class="h-56 w-full rounded-md bg-page" role="img" :aria-label="t('misc.hlLimits.historyTitle')">
            <polyline :points="historyPoints('cap')" fill="none" stroke="var(--warning-soft)" stroke-width="3" />
            <polyline :points="historyPoints('used')" fill="none" stroke="var(--accent-soft)" stroke-width="3" />
          </svg>
          <div class="mt-2 flex gap-5 text-xs text-secondary">
            <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-accent-soft" aria-hidden="true" />{{ t('misc.hlLimits.used') }}</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-warning-soft" aria-hidden="true" />{{ t('misc.hlLimits.cap') }}</span>
          </div>
        </template>
      </ChartFrame>

    </div>
  </AppShell>
</template>
