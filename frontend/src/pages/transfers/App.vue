<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch, ApiError } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import { useAiPageContext } from '@/shared/ai/context';
import { serverMsg } from '@/shared/i18n';
import { dialogsConfirm } from '@/shared/lib/dialogs';
import AppShell from '@/shared/components/AppShell.vue';
import EmptyState from '@/shared/components/EmptyState.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { PhArrowClockwise, PhArrowRight, PhArrowsLeftRight, PhWarning } from '@phosphor-icons/vue';

interface TransferUser { name: string; exchange?: string; account_type?: string }
interface TransferRoute {
  id: string;
  asset?: string;
  source?: string;
  destination?: string;
  minimum_amount?: string;
  source_balance?: string;
  max_transferable?: string;
  destination_balance?: string | null;
}
interface Position {
  coin?: string;
  side?: string;
  size?: string;
  position_value?: string | null;
  entry_price?: string | null;
  unrealized_pnl?: string | null;
  liquidation_price?: string | null;
  leverage_type?: string | null;
}
interface TransferPreview {
  account_type?: string;
  exchange?: string;
  route_note?: string | null;
  routes?: TransferRoute[];
  positions?: Position[];
  position_count?: number;
  positions_truncated?: boolean;
  blocked_reason?: string | null;
  your_vault_equity?: string;
  vault_account_value?: string;
  user_max_withdrawable?: string;
}
interface TransferOperation {
  operation_id?: string;
  status?: string;
  route?: string;
  asset?: string;
  requested_amount?: string;
  actual_amount?: string | null;
  prepared_at?: string | null;
  submitted_at?: string | null;
  resolved_at?: string | null;
  error?: { reason?: string } | null;
  reconciliation?: { status?: string | null; reason?: string | null } | null;
  can_reconcile?: boolean;
}
interface PendingTransfer {
  user: string;
  route: string;
  amount: string;
  operation_id: string;
  created_at: number;
}

const PENDING_KEY = 'pbgui:transfers:pending-top-up:v1';
const routeLabels: Record<string, string> = {
  perp_to_spot: 'Perps -> Spot',
  spot_to_perp: 'Spot -> Perps',
  vault_to_main_perps: 'Vault -> Main Perps',
  main_perps_to_vault: 'Main Perps -> Vault',
  main_perps_to_spot: 'Main Perps -> Main Spot',
  main_spot_to_perps: 'Main Spot -> Main Perps',
  unified_to_fund: 'Unified -> Funding',
  fund_to_unified: 'Funding -> Unified',
  umfuture_to_funding: 'USD-M Futures -> Funding',
  funding_to_umfuture: 'Funding -> USD-M Futures',
  usdt_futures_to_spot: 'USDT Futures -> Spot',
  spot_to_usdt_futures: 'Spot -> USDT Futures',
  uta_to_spot: 'UTA -> Spot',
  spot_to_uta: 'Spot -> UTA',
};

const { t } = useI18n();
const apiBase = getBoot().base_prefix + '/api/profit-sweep';
const users = ref<TransferUser[]>([]);
const selectedUser = ref('');
const search = ref('');
const preview = ref<TransferPreview | null>(null);
const operations = ref<TransferOperation[]>([]);
const selectedRouteId = ref('');
const amount = ref('5');
const pendingTransfer = ref<PendingTransfer | null>(readPendingTransfer());
const loading = ref(false);
const actionPending = ref(false);
const errorMessage = ref('');
const statusMessage = ref('');

const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase();
  return query
    ? users.value.filter((user) => `${user.name} ${user.exchange || ''}`.toLowerCase().includes(query))
    : users.value;
});
const selectedRoute = computed(() => preview.value?.routes?.find((route) => route.id === selectedRouteId.value) ?? null);
const isVault = computed(() => preview.value?.account_type === 'vault');
const canSubmit = computed(() => {
  const route = selectedRoute.value;
  const numericAmount = Number(amount.value);
  return Boolean(
    selectedUser.value && route && Number.isFinite(numericAmount)
      && numericAmount >= Number(route.minimum_amount || 0.000001)
      && numericAmount <= Number(route.max_transferable || 0),
  );
});

function readPendingTransfer(): PendingTransfer | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) || 'null') as Partial<PendingTransfer> | null;
    if (!value || typeof value.user !== 'string' || typeof value.route !== 'string' || typeof value.amount !== 'string' || typeof value.operation_id !== 'string') return null;
    if (!/^[0-9a-f-]{36}$/i.test(value.operation_id) || Date.now() - Number(value.created_at || 0) > 86400000) return null;
    return { user: value.user, route: value.route, amount: value.amount, operation_id: value.operation_id, created_at: Number(value.created_at) };
  } catch {
    return null;
  }
}
function persistPendingTransfer(value: PendingTransfer | null): void {
  pendingTransfer.value = value;
  try {
    if (value) window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage is optional; the server-side operation remains authoritative.
  }
}
function routeLabel(routeId: string): string { return routeLabels[routeId] || routeId; }
function operationStatusClass(status?: string): string {
  if (status === 'confirmed') return 'border-success/40 bg-success/10 text-success';
  if (status === 'failed') return 'border-danger/40 bg-danger/10 text-danger';
  return 'border-warning/40 bg-warning/10 text-warning';
}
function formatValue(value: unknown): string { return value === undefined || value === null || value === '' ? '-' : String(value); }
function formatTime(value: unknown): string {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
function detailOf(error: unknown): string {
  const raw = error instanceof ApiError ? error.detail : error instanceof Error ? error.message : String(error);
  return serverMsg(raw);
}
function newOperationId(): string {
  if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const randomValue = Math.floor(Math.random() * 16);
    const value = character === 'x' ? randomValue : (randomValue & 0x3) | 0x8;
    return value.toString(16);
  });
}
function setStatus(message: string, isError = false): void {
  if (isError) errorMessage.value = message;
  else statusMessage.value = message;
}
function selectRequestedRoute(routes: TransferRoute[]): void {
  const requested = pendingTransfer.value?.user === selectedUser.value
    ? pendingTransfer.value.route
    : new URLSearchParams(window.location.search).get('route') || '';
  selectedRouteId.value = routes.some((route) => route.id === requested) ? requested : routes[0]?.id || '';
  const pendingAmount = pendingTransfer.value?.user === selectedUser.value && pendingTransfer.value.route === selectedRouteId.value
    ? pendingTransfer.value.amount
    : '';
  if (pendingAmount) amount.value = pendingAmount;
  else if (selectedRoute.value?.minimum_amount && Number(amount.value) < Number(selectedRoute.value.minimum_amount)) amount.value = selectedRoute.value.minimum_amount;
}
async function loadUsers(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const response = await apiFetch<{ users?: TransferUser[] }>(`${apiBase}/transfers/users`);
    users.value = response.users || [];
    const requested = pendingTransfer.value?.user || new URLSearchParams(window.location.search).get('user') || '';
    const next = users.value.some((user) => user.name === requested) ? requested : users.value[0]?.name || '';
    if (next) await loadAccount(next);
  } catch (error) {
    setStatus(detailOf(error), true);
  } finally {
    loading.value = false;
  }
}
async function loadAccount(name: string): Promise<void> {
  if (!users.value.some((user) => user.name === name)) return;
  selectedUser.value = name;
  preview.value = null;
  operations.value = [];
  errorMessage.value = '';
  actionPending.value = true;
  try {
    const [nextPreview, operationResponse] = await Promise.all([
      apiFetch<TransferPreview>(`${apiBase}/transfers/preview/${encodeURIComponent(name)}`),
      apiFetch<{ operations?: TransferOperation[] }>(`${apiBase}/transfers/operations/${encodeURIComponent(name)}`),
    ]);
    preview.value = nextPreview;
    operations.value = operationResponse.operations || [];
    selectRequestedRoute(nextPreview.routes || []);
  } catch (error) {
    setStatus(detailOf(error), true);
  } finally {
    actionPending.value = false;
  }
}
async function reviewTransfer(): Promise<void> {
  const route = selectedRoute.value;
  if (!route || !canSubmit.value || !selectedUser.value) return;
  const retained = pendingTransfer.value;
  if (retained && (retained.user !== selectedUser.value || retained.route !== route.id || retained.amount !== amount.value)) {
    setStatus(t('transfers.pendingMismatch'), true);
    return;
  }
  const accepted = await dialogsConfirm({
    title: t('transfers.reviewTitle'),
    message: t('transfers.reviewMessage', { amount: amount.value, asset: route.asset || 'USDC', source: route.source || '-', destination: route.destination || '-' }),
    confirmText: t('transfers.submit'),
  });
  if (!accepted) return;
  const request = retained || { user: selectedUser.value, route: route.id, amount: amount.value, operation_id: newOperationId(), created_at: Date.now() };
  persistPendingTransfer(request);
  actionPending.value = true;
  errorMessage.value = '';
  try {
    const result = await apiFetch<{ status?: string; operation?: TransferOperation }>(`${apiBase}/transfers/execute/${encodeURIComponent(selectedUser.value)}`, {
      method: 'POST',
      body: JSON.stringify({ amount: request.amount, operation_id: request.operation_id, route: request.route }),
    });
    persistPendingTransfer(null);
    setStatus(result.status === 'confirmed' ? t('transfers.confirmed') : t('transfers.result', { status: result.status || 'unknown' }));
    await loadAccount(selectedUser.value);
  } catch (error) {
    setStatus(detailOf(error), true);
  } finally {
    actionPending.value = false;
  }
}
async function reconcile(operation: TransferOperation): Promise<void> {
  if (!operation.operation_id || !selectedUser.value || !operation.can_reconcile) return;
  actionPending.value = true;
  try {
    const result = await apiFetch<{ status?: string }>(`${apiBase}/transfers/operations/${encodeURIComponent(selectedUser.value)}/${encodeURIComponent(operation.operation_id)}/reconcile`, { method: 'POST' });
    setStatus(result.status === 'confirmed' ? t('transfers.confirmed') : t('transfers.result', { status: result.status || 'unknown' }));
    await loadAccount(selectedUser.value);
  } catch (error) {
    setStatus(detailOf(error), true);
  } finally {
    actionPending.value = false;
  }
}
watch(selectedRouteId, () => {
  const minimum = Number(selectedRoute.value?.minimum_amount || 0.000001);
  if (!pendingTransfer.value && Number(amount.value) < minimum) amount.value = String(selectedRoute.value?.minimum_amount || minimum);
});

useAiPageContext({ id: 'transfers', getContext: () => ({ section: 'internal-transfer', entities: selectedUser.value ? [{ kind: 'exchange_account', name: selectedUser.value }] : [] }) });
onMounted(() => { document.title = t('transfers.title'); void loadUsers(); });
</script>

<template>
  <AppShell page-key="system_transfers" :page-title="t('transfers.title')" :page-description="t('transfers.pageDescription')" class="transfers-shell">
    <template v-if="loading || errorMessage" #status><StatusStrip :label="t('shared.status')" :value="loading ? t('common.loading') : t('common.error')" :tone="errorMessage ? 'danger' : 'warning'" /></template>
    <template #header-actions><Button size="sm" :disabled="loading || actionPending" @click="loadUsers"><PbIcon :icon="PhArrowClockwise" /> {{ t('common.refresh') }}</Button></template>
    <div class="flex min-h-0 flex-1 gap-4 overflow-hidden p-4 max-[900px]:flex-col">
      <aside class="w-72 shrink-0 overflow-auto rounded-lg border border-border-default bg-panel p-3 max-[900px]:w-full max-[900px]:max-h-52">
        <div class="mb-3 flex items-center justify-between"><h2 class="text-base font-semibold text-primary">{{ t('transfers.accounts') }}</h2><span class="text-xs text-secondary">{{ filteredUsers.length }}/{{ users.length }}</span></div>
        <Input v-model="search" class="mb-2" :placeholder="t('transfers.searchAccounts')" />
        <div class="grid gap-1">
          <button v-for="user in filteredUsers" :key="user.name" type="button" class="rounded-md border border-transparent px-3 py-2 text-left hover:bg-card" :class="user.name === selectedUser ? 'border-accent/30 bg-accent/10' : ''" :disabled="actionPending" @click="loadAccount(user.name)"><span class="block font-semibold text-primary">{{ user.name }}</span><span class="text-xs text-secondary">{{ user.exchange || t('transfers.unknownExchange') }} / {{ user.account_type || t('transfers.standard') }}</span></button>
          <LoadingSkeleton v-if="loading" class="p-3" :lines="2" :label="t('common.loading')" />
          <EmptyState v-else-if="!filteredUsers.length" class="py-4" :title="t('transfers.noAccounts')" />
        </div>
      </aside>
      <main class="min-w-0 flex-1 overflow-auto">
        <header class="mb-4 flex flex-wrap items-start justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-label text-accent">{{ preview?.exchange || t('transfers.eyebrow') }}</p><h1 class="text-2xl font-bold text-primary">{{ selectedUser || t('transfers.title') }}</h1><p class="text-sm text-secondary">{{ selectedUser ? t('transfers.accountSubtitle', { type: preview?.account_type || 'standard' }) : t('transfers.selectAccount') }}</p></div></header>
        <p v-if="errorMessage" class="mb-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{{ errorMessage }}</p>
        <p v-if="statusMessage" class="mb-3 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{{ statusMessage }}</p>
        <section class="rounded-lg border border-border-default bg-panel">
          <div class="border-b border-border-default p-4"><h2 class="text-lg font-semibold text-primary">{{ t('transfers.internalTransfer') }}</h2><p class="text-sm text-secondary">{{ t('transfers.internalHint') }}</p></div>
          <div class="space-y-4 p-4">
            <div v-if="!preview && actionPending" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-busy="true" aria-live="polite">
              <span class="sr-only">{{ t('common.loading') }}</span>
              <div class="h-[76px] rounded-lg border border-border-default bg-field p-3 sm:col-span-2" aria-hidden="true"><span class="pbgui-skeleton block h-3 w-16" /><span class="pbgui-skeleton mt-2.5 block h-5 w-44" /></div>
              <div class="h-[76px] rounded-lg border border-border-default bg-field p-3" aria-hidden="true"><span class="pbgui-skeleton block h-3 w-16" /><span class="pbgui-skeleton mt-2.5 block h-5 w-28" /></div>
              <div v-for="n in 3" :key="n" class="h-[76px] rounded-lg border border-border-default bg-field p-3" aria-hidden="true"><span class="pbgui-skeleton block h-3 w-20" /><span class="pbgui-skeleton mt-2.5 block h-5 w-32" /></div>
            </div>
            <EmptyState v-else-if="!preview && !selectedUser" :title="t('transfers.selectAccount')" class="py-8!" />
            <template v-else>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <article class="min-w-0 rounded-lg border border-border-default bg-field p-3 sm:col-span-2">
                  <p class="text-xs uppercase tracking-label text-muted">{{ t('transfers.route') }}</p>
                  <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold text-primary"><span class="break-words">{{ formatValue(selectedRoute?.source) }}</span><PbIcon :icon="PhArrowRight" aria-hidden="true" class="shrink-0 text-accent" /><span class="break-words">{{ formatValue(selectedRoute?.destination) }}</span></p>
                </article>
                <article class="min-w-0 rounded-lg border border-border-default bg-field p-3 sm:col-span-2 lg:col-span-1">
                  <p class="text-xs uppercase tracking-label text-muted">{{ t('transfers.available') }}</p>
                  <p class="mt-1 break-words text-xl font-semibold tabular-nums text-primary">{{ selectedRoute ? selectedRoute.max_transferable : '-' }} <span class="text-xs font-normal text-secondary">{{ selectedRoute?.asset || 'USDC' }}</span></p>
                </article>
                <article v-for="item in [{ label: t('transfers.minimum'), value: selectedRoute ? `${selectedRoute.minimum_amount} ${selectedRoute.asset || 'USDC'}` : '-' }, { label: t('transfers.sourceBalance'), value: selectedRoute ? `${selectedRoute.source_balance} ${selectedRoute.asset || 'USDC'}` : '-' }, { label: t('transfers.destinationBalance'), value: selectedRoute?.destination_balance ? `${selectedRoute.destination_balance} ${selectedRoute.asset || 'USDC'}` : '-' }]" :key="item.label" class="min-w-0 rounded-lg border border-border-default bg-field p-3"><p class="text-xs uppercase tracking-label text-muted">{{ item.label }}</p><p class="mt-1 break-words text-base font-semibold tabular-nums text-primary">{{ formatValue(item.value) }}</p></article>
              </div>
              <section v-if="isVault" class="border-t border-border-default pt-4">
                <h3 class="mb-3 text-sm font-semibold text-primary">{{ t('transfers.vaultSection') }}</h3>
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <article v-for="item in [{ label: t('transfers.vaultEquity'), value: preview?.your_vault_equity }, { label: t('transfers.vaultAccountValue'), value: preview?.vault_account_value }, { label: t('transfers.maxWithdrawable'), value: preview?.user_max_withdrawable }]" :key="item.label" class="min-w-0 rounded-lg border border-border-default bg-field p-3"><p class="text-xs uppercase tracking-label text-muted">{{ item.label }}</p><p class="mt-1 break-words text-base font-semibold tabular-nums text-primary">{{ formatValue(item.value) }}</p></article>
                </div>
              </section>
            </template>
            <p class="rounded-md border border-accent/25 bg-accent/5 p-3 text-sm text-secondary">{{ t('transfers.accountingNotice') }}</p>
            <p v-if="preview?.route_note" class="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{{ preview.route_note }}</p>
            <p v-if="preview?.blocked_reason" class="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning"><PbIcon :icon="PhWarning" /> {{ preview.blocked_reason }}</p>
            <div class="grid items-start gap-3 md:grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_auto]"><label class="grid gap-1 text-sm font-medium text-primary">{{ t('transfers.direction') }}<SelectRoot v-model="selectedRouteId" :disabled="!preview?.routes?.length || actionPending"><SelectTrigger class="h-9" :placeholder="t('transfers.selectRoute')" /><SelectContent><SelectItem v-for="route in preview?.routes || []" :key="route.id" :value="route.id">{{ routeLabel(route.id) }}</SelectItem></SelectContent></SelectRoot></label><label class="grid gap-1 text-sm font-medium text-primary">{{ t('transfers.amount') }} ({{ selectedRoute?.asset || 'USDC' }})<Input v-model="amount" type="number" min="0.000001" step="any" inputmode="decimal" :disabled="actionPending" /><span v-if="selectedRoute" class="text-xs text-muted">{{ t('transfers.amountRange', { min: selectedRoute.minimum_amount, max: selectedRoute.max_transferable, asset: selectedRoute.asset || 'USDC' }) }}</span></label><Button class="md:mt-6" variant="primary" :disabled="!canSubmit || actionPending" @click="reviewTransfer"><PbIcon :icon="PhArrowsLeftRight" /> {{ t('transfers.review') }}</Button></div>
            <section v-if="isVault" class="border-t border-border-default pt-4"><div class="mb-3 flex items-start justify-between gap-2"><div><h3 class="font-semibold text-primary">{{ t('transfers.positions') }}</h3><p class="text-sm text-secondary">{{ t('transfers.positionImpact') }}</p></div><span class="shrink-0 rounded-full border border-border-default px-2 py-1 text-xs text-secondary">{{ preview?.position_count || 0 }}</span></div><EmptyState v-if="!preview?.positions?.length" :title="t('transfers.noPositions')" class="py-8!" /><div v-else class="pbgui-table-wrap"><table class="pbgui-list-table w-full border-separate border-spacing-0 text-sm max-[900px]:min-w-[760px]"><thead><tr><th>{{ t('transfers.coin') }}</th><th>{{ t('transfers.side') }}</th><th class="text-right!">{{ t('transfers.size') }}</th><th class="text-right!">{{ t('transfers.positionValue') }}</th><th class="text-right!">{{ t('transfers.entry') }}</th><th class="text-right!">{{ t('transfers.unrealizedPnl') }}</th><th class="text-right!">{{ t('transfers.liquidation') }}</th><th>{{ t('transfers.leverage') }}</th></tr></thead><tbody><tr v-for="position in preview.positions" :key="`${position.coin}-${position.side}`"><td class="font-mono text-primary">{{ position.coin }}</td><td class="font-semibold uppercase" :class="position.side === 'long' ? 'text-success' : 'text-danger'">{{ position.side }}</td><td class="text-right font-mono tabular-nums">{{ position.size }}</td><td class="text-right font-mono tabular-nums">{{ position.position_value }}</td><td class="text-right font-mono tabular-nums">{{ position.entry_price }}</td><td class="text-right font-mono tabular-nums">{{ position.unrealized_pnl }}</td><td class="text-right font-mono tabular-nums">{{ position.liquidation_price }}</td><td>{{ position.leverage_type }}</td></tr></tbody></table></div></section>
          </div>
        </section>
        <section class="mt-4 rounded-lg border border-border-default bg-panel"><div class="border-b border-border-default p-4"><h2 class="text-lg font-semibold text-primary">{{ t('transfers.history') }}</h2><p class="text-sm text-secondary">{{ t('transfers.historyHint') }}</p></div><div v-if="operations.length" class="pbgui-table-wrap"><table class="pbgui-list-table w-full border-separate border-spacing-0 text-sm max-[900px]:min-w-[720px]"><thead><tr><th>{{ t('transfers.operation') }}</th><th>{{ t('transfers.route') }}</th><th class="text-right!">{{ t('transfers.amount') }}</th><th>{{ t('transfers.status') }}</th><th>{{ t('transfers.created') }}</th><th><span class="sr-only">{{ t('transfers.reconcile') }}</span></th></tr></thead><tbody><tr v-for="operation in operations" :key="operation.operation_id"><td class="font-mono text-xs text-secondary"><span class="block max-w-[9ch] truncate" :title="operation.operation_id">{{ operation.operation_id }}</span></td><td>{{ routeLabel(operation.route || '') }}</td><td class="text-right font-mono tabular-nums">{{ formatValue(operation.actual_amount || operation.requested_amount) }} <span class="text-secondary">{{ operation.asset || 'USDC' }}</span></td><td><span class="rounded-full border px-2 py-1 text-xs font-semibold uppercase" :class="operationStatusClass(operation.status)">{{ operation.status }}</span></td><td class="whitespace-nowrap text-secondary">{{ formatTime(operation.prepared_at) }}</td><td class="text-right"><Button v-if="operation.can_reconcile" size="sm" variant="secondary" :disabled="actionPending" @click="reconcile(operation)">{{ t('transfers.reconcile') }}</Button></td></tr></tbody></table></div><div v-else-if="actionPending" class="space-y-3 p-4" role="status" aria-busy="true" aria-live="polite"><span class="sr-only">{{ t('common.loading') }}</span><span v-for="n in 3" :key="n" class="pbgui-skeleton block h-4" aria-hidden="true" /></div><EmptyState v-else :title="t('transfers.noHistory')" :message="t('transfers.noHistoryHint')" class="m-4 py-8!" /></section>
      </main>
    </div>
  </AppShell>
</template>
