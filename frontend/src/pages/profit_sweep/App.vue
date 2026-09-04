<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch, ApiError } from '@/shared/api';
import { serverMsg } from '@/shared/i18n';
import { dialogsConfirm } from '@/shared/lib/dialogs';
import { getBoot } from '@/shared/boot';
import { useAiPageContext } from '@/shared/ai/context';
import AppShell from '@/shared/components/AppShell.vue';
import EmptyState from '@/shared/components/EmptyState.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import { PhArrowClockwise, PhChartLineUp, PhFloppyDisk, PhPlay, PhTrash, PhWarning } from '@phosphor-icons/vue';

interface SweepUser { name: string; exchange?: string; is_vault?: boolean; operating_mode?: string; due?: unknown; has_policy?: boolean }
interface SweepSchema { defaults: Record<string, unknown>; options?: Record<string, unknown>; live_available?: boolean }
interface SweepRecord { policy: Record<string, unknown>; generation?: number; policy_fingerprint?: string; simulation_state?: Record<string, unknown>; live_state?: Record<string, unknown>; [key: string]: unknown }
interface SweepJournalEntry { created_at?: string; reason?: string; amount?: unknown; net_pnl?: unknown; due_after?: unknown }
interface SweepIntent { operation_id?: string; state?: string; route?: string; reserved_amount?: unknown; can_reconcile?: boolean }

const { t, te } = useI18n();
const boot = getBoot();
const apiBase = `${boot.origin}/api/profit-sweep`;
const schema = ref<SweepSchema>({ defaults: {} });
const users = ref<SweepUser[]>([]);
const selectedUser = ref('');
const record = ref<SweepRecord | null>(null);
const policy = ref<Record<string, unknown>>({});
const journal = ref<SweepJournalEntry[]>([]);
const intents = ref<SweepIntent[]>([]);
const preview = ref<Record<string, unknown> | null>(null);
const activeTab = ref<'overview' | 'policy' | 'schedule' | 'vault' | 'journal'>('overview');
const search = ref('');
const loading = ref(false);
const actionPending = ref(false);
const errorMessage = ref('');
const statusMessage = ref('');

const hiddenFields = new Set(['operating_mode', 'asset', 'simulation_minimum_transfer_amount', 'live_minimum_transfer_amount', 'live_activation_baseline_mode', 'first_live_catchup_limit_enabled', 'first_live_catchup_limit', 'vault_conditional_cost_policy']);
const groups: Record<string, string[]> = {
  policy: ['baseline_mode', 'reference_capital', 'trigger_percent', 'sweep_percent', 'minimum_transfer_amount', 'transfer_rounding_step', 'safety_reserve_mode', 'safety_reserve_amount', 'safety_reserve_percent', 'daily_transfer_limit_enabled', 'daily_transfer_limit', 'single_transfer_limit_enabled', 'single_transfer_limit'],
  schedule: ['trigger_mode', 'periodic_interval', 'settlement_debounce', 'quiet_period', 'stabilization_interval', 'successful_transfer_cooldown', 'vault_transfer_cooldown', 'schedule_jitter_percent', 'maximum_history_age', 'maximum_preflight_age'],
  vault: ['vault_withdraw_mode', 'vault_destination', 'vault_minimum_transfer_amount', 'retained_leader_equity', 'share_safety_buffer', 'vault_safety_reserve_mode', 'vault_safety_reserve_amount', 'vault_safety_reserve_percent', 'main_destination_activity_policy'],
};
const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase();
  return query ? users.value.filter((user) => `${user.name} ${user.exchange || ''}`.toLowerCase().includes(query)) : users.value;
});
const currentUser = computed(() => users.value.find((user) => user.name === selectedUser.value) ?? null);
const currentMode = computed(() => String(policy.value.operating_mode || 'disabled'));

/** operating_mode → localized label (the raw key falls through for unknown values). */
const MODE_LABEL_KEYS: Record<string, string> = {
  disabled: 'profitSweep.modeDisabled',
  dry: 'profitSweep.modeDry',
  live: 'profitSweep.modeLive',
  paused_unknown: 'profitSweep.modePausedUnknown',
};
function modeLabel(mode: string | undefined): string {
  const key = MODE_LABEL_KEYS[String(mode || 'disabled')];
  return key ? t(key) : String(mode || 'disabled');
}
const statusState = computed(() => currentMode.value === 'live' || currentMode.value === 'paused_unknown' ? record.value?.live_state : record.value?.simulation_state);
const fieldsFor = (group: string) => (groups[group] || []).filter((field) => Object.prototype.hasOwnProperty.call(schema.value.defaults, field) && !hiddenFields.has(field));
const fieldOptions = (field: string) => Array.isArray(schema.value.options?.[field]) ? schema.value.options[field] as unknown[] : [];

function fieldLabel(field: string): string {
  const key = `profitSweep.field.${field}.label`;
  if (te(key)) return t(key);
  return field.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
const previewLabels: Record<string, string> = {
  amount: 'profitSweep.amount',
  reason: 'profitSweep.reason',
  net_pnl: 'profitSweep.netPnl',
  high_watermark: 'profitSweep.highWatermark',
  sweep_due: 'profitSweep.due',
  effective_cap: 'profitSweep.effectiveCap',
};
function previewLabel(key: string): string {
  const i18nKey = previewLabels[key];
  return i18nKey ? t(i18nKey) : fieldLabel(key);
}
function fieldValue(field: string): unknown { return policy.value[field] ?? schema.value.defaults[field]; }
function setField(field: string, value: unknown): void { policy.value = { ...policy.value, [field]: value }; }
function setInputField(field: string, event: Event): void { const input = event.target as HTMLInputElement; setField(field, typeof schema.value.defaults[field] === 'number' ? Number(input.value) : input.value); }
function setCheckboxField(field: string, event: Event): void { setField(field, (event.target as HTMLInputElement).checked); }
function formatValue(value: unknown): string { return value === undefined || value === null || value === '' ? '-' : String(value); }
function formatTime(value: unknown): string { if (!value) return '-'; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(); }
function detailOf(error: unknown): string {
  const raw = error instanceof ApiError ? error.detail : error instanceof Error ? error.message : String(error);
  return serverMsg(raw);
}
async function confirmAction(title: string, message: string): Promise<boolean> {
  return dialogsConfirm({ title, message, confirmText: t('common.ok') });
}

async function loadAccount(name: string): Promise<void> {
  selectedUser.value = name; record.value = null; preview.value = null; journal.value = []; intents.value = []; errorMessage.value = '';
  try {
    const [policyResponse, journalResponse, intentsResponse] = await Promise.all([
      apiFetch<SweepRecord>(`${apiBase}/policies/${encodeURIComponent(name)}`).catch((error: unknown) => { if (error instanceof ApiError && error.status === 404) return null; throw error; }),
      apiFetch<{ journal?: SweepJournalEntry[] }>(`${apiBase}/journal/${encodeURIComponent(name)}?limit=100`).catch((error: unknown) => { if (error instanceof ApiError && error.status === 404) return { journal: [] }; throw error; }),
      apiFetch<{ intents?: SweepIntent[] }>(`${apiBase}/intents/${encodeURIComponent(name)}`).catch((error: unknown) => { if (error instanceof ApiError && error.status === 404) return { intents: [] }; throw error; }),
    ]);
    record.value = policyResponse; policy.value = { ...schema.value.defaults, ...(policyResponse?.policy || {}) }; journal.value = journalResponse.journal || []; intents.value = intentsResponse.intents || [];
  } catch (error) { errorMessage.value = detailOf(error); policy.value = { ...schema.value.defaults }; }
}
async function loadPage(): Promise<void> {
  loading.value = true;
  try { schema.value = await apiFetch<SweepSchema>(`${apiBase}/schema`); const response = await apiFetch<{ users?: SweepUser[] }>(`${apiBase}/users`); users.value = response.users || []; const first = users.value.find((user) => user.name === selectedUser.value)?.name || users.value[0]?.name || ''; if (first) await loadAccount(first); }
  catch (error) { errorMessage.value = detailOf(error); } finally { loading.value = false; }
}
async function savePolicy(): Promise<void> {
  if (!selectedUser.value) return; actionPending.value = true;
  try { const body: Record<string, unknown> = { policy: { ...policy.value } }; if (record.value) { body.expected_generation = record.value.generation; body.expected_policy_fingerprint = record.value.policy_fingerprint; } record.value = await apiFetch<SweepRecord>(`${apiBase}/policies/${encodeURIComponent(selectedUser.value)}`, { method: 'PUT', body: JSON.stringify(body) }); policy.value = { ...policy.value, ...(record.value.policy || {}) }; statusMessage.value = t('profitSweep.saved'); }
  catch (error) { errorMessage.value = detailOf(error); } finally { actionPending.value = false; }
}
async function setMode(mode: string): Promise<void> { policy.value = { ...policy.value, operating_mode: mode }; await savePolicy(); await loadAccount(selectedUser.value); }
async function evaluate(): Promise<void> {
  if (!selectedUser.value) return; actionPending.value = true;
  try { preview.value = await apiFetch<Record<string, unknown>>(`${apiBase}/evaluate/${encodeURIComponent(selectedUser.value)}`, { method: 'POST', body: JSON.stringify({ policy: policy.value }) }); statusMessage.value = t('profitSweep.evaluated'); }
  catch (error) { errorMessage.value = detailOf(error); } finally { actionPending.value = false; }
}
async function enableLive(): Promise<void> {
  if (!record.value || !await confirmAction(t('profitSweep.enableLiveTitle'), t('profitSweep.enableLiveMessage'))) return; actionPending.value = true;
  try { record.value = await apiFetch<SweepRecord>(`${apiBase}/live/${encodeURIComponent(selectedUser.value)}`, { method: 'POST', body: JSON.stringify({ expected_policy_fingerprint: record.value.policy_fingerprint }) }); policy.value = { ...policy.value, ...(record.value.policy || {}) }; statusMessage.value = t('profitSweep.liveEnabled'); }
  catch (error) { errorMessage.value = detailOf(error); } finally { actionPending.value = false; }
}
async function deletePolicy(): Promise<void> {
  if (!record.value || !await confirmAction(t('profitSweep.deleteTitle'), t('profitSweep.deleteMessage'))) return; actionPending.value = true;
  try { await apiFetch(`${apiBase}/policies/${encodeURIComponent(selectedUser.value)}`, { method: 'DELETE', body: JSON.stringify({ expected_policy_fingerprint: record.value.policy_fingerprint }) }); await loadPage(); statusMessage.value = t('profitSweep.deleted'); }
  catch (error) { errorMessage.value = detailOf(error); } finally { actionPending.value = false; }
}
async function reconcile(intent: SweepIntent): Promise<void> {
  if (!intent.operation_id) return;
  try { await apiFetch(`${apiBase}/reconcile/${encodeURIComponent(selectedUser.value)}/${encodeURIComponent(intent.operation_id)}`, { method: 'POST' }); await loadAccount(selectedUser.value); }
  catch (error) { errorMessage.value = detailOf(error); }
}

useAiPageContext({ id: 'profit-sweep', getContext: () => ({ section: activeTab.value, entities: currentUser.value ? [{ kind: 'exchange_account', name: currentUser.value.name }] : [] }) });
onMounted(() => { document.title = t('profitSweep.title'); void loadPage(); });
</script>

<template>
  <AppShell page-key="system_profit_sweep" :page-title="t('profitSweep.title')" class="profit-sweep-shell">
    <template v-if="loading || errorMessage" #status><StatusStrip :label="t('shared.status')" :value="loading ? t('common.loading') : t('common.error')" :tone="errorMessage ? 'danger' : 'warning'" /></template>
    <template #header-actions><Button size="sm" :disabled="loading" @click="loadPage"><PbIcon :icon="PhArrowClockwise" /> {{ t('common.refresh') }}</Button></template>
    <div class="flex min-h-0 flex-1 gap-4 overflow-hidden p-4 max-[900px]:flex-col">
      <aside class="w-72 shrink-0 overflow-auto rounded-lg border border-border-default bg-panel p-3 max-[900px]:w-full max-[900px]:max-h-52"><div class="mb-3 flex items-center justify-between"><h2 class="text-base font-semibold text-primary">{{ t('profitSweep.accounts') }}</h2><span class="text-xs text-secondary">{{ filteredUsers.length }}/{{ users.length }}</span></div><Input v-model="search" class="mb-2" :placeholder="t('profitSweep.searchAccounts')" /><div class="grid gap-1"><button v-for="user in filteredUsers" :key="user.name" type="button" class="rounded-md border border-transparent px-3 py-2 text-left hover:bg-card" :class="user.name === selectedUser ? 'border-accent/30 bg-accent/10' : ''" @click="loadAccount(user.name)"><span class="block font-semibold text-primary">{{ user.name }}</span><span class="text-xs text-secondary">{{ user.exchange || t('profitSweep.unknownExchange') }}{{ user.is_vault ? t('profitSweep.vaultSuffix') : '' }} · {{ modeLabel(user.operating_mode) }}</span></button><LoadingSkeleton v-if="loading" class="p-3" :lines="2" :label="t('common.loading')" /><EmptyState v-else-if="!filteredUsers.length" class="py-4" :title="t('profitSweep.noAccounts')" /></div></aside>
      <main class="min-w-0 flex-1 overflow-auto"><header class="mb-4 flex flex-wrap items-start justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-wider text-accent">{{ currentUser?.exchange || t('profitSweep.selectAccount') }}</p><h1 class="text-2xl font-bold text-primary">{{ currentUser?.name || t('profitSweep.title') }}</h1><p class="text-sm text-secondary">{{ t('profitSweep.readOnlyHint') }}</p></div><div class="flex flex-wrap gap-2"><Button variant="warning" :disabled="!selectedUser || actionPending" @click="setMode('dry')"><PbIcon :icon="PhChartLineUp" /> {{ t('profitSweep.enableDry') }}</Button><Button :disabled="!selectedUser || actionPending" @click="evaluate"><PbIcon :icon="PhPlay" /> {{ t('profitSweep.evaluate') }}</Button><Button variant="danger" :disabled="!record || actionPending" @click="deletePolicy"><PbIcon :icon="PhTrash" /> {{ t('profitSweep.delete') }}</Button></div></header><p v-if="errorMessage" class="mb-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{{ errorMessage }}</p><p v-if="statusMessage" class="mb-3 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{{ statusMessage }}</p>
        <div v-if="selectedUser" class="grid gap-3 sm:grid-cols-4"><article v-for="item in [{ label: t('profitSweep.mode'), value: modeLabel(currentMode) }, { label: t('profitSweep.due'), value: preview?.decision && typeof preview.decision === 'object' ? (preview.decision as Record<string, unknown>).sweep_due : statusState?.sweep_due }, { label: t('profitSweep.lastPnl'), value: statusState?.last_net_pnl }, { label: t('profitSweep.highWatermark'), value: statusState?.high_watermark }]" :key="item.label" class="rounded-lg border border-border-default bg-panel p-3"><p class="text-xs uppercase tracking-wide text-muted">{{ item.label }}</p><p class="mt-1 truncate text-lg font-semibold text-primary">{{ formatValue(item.value) }}</p></article></div>
        <nav class="mt-4 flex gap-1 overflow-x-auto rounded-lg border border-border-default bg-panel p-1"><button v-for="tab in (['overview', 'policy', 'schedule', 'vault', 'journal'] as const)" :key="tab" type="button" class="rounded-md px-3 py-2 text-sm font-semibold text-secondary hover:bg-card hover:text-primary" :class="activeTab === tab ? 'bg-accent/15 text-primary' : ''" @click="activeTab = tab">{{ t(`profitSweep.tabs.${tab}`) }}</button></nav>
        <section v-if="activeTab === 'overview'" class="mt-4 grid gap-4 lg:grid-cols-2"><div class="rounded-lg border border-border-default bg-panel p-4"><h2 class="text-lg font-semibold text-primary">{{ t('profitSweep.overview') }}</h2><dl class="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded border border-border-default bg-border-default"><template v-for="item in [{ label: t('profitSweep.exchange'), value: currentUser?.exchange }, { label: t('profitSweep.accountType'), value: currentUser?.is_vault ? t('profitSweep.vaultType') : t('profitSweep.standardType') }, { label: t('profitSweep.policyState'), value: record ? t('profitSweep.saved') : t('profitSweep.notSaved') }, { label: t('profitSweep.nextRun'), value: statusState?.next_run_at ? formatTime(statusState.next_run_at) : '-' }]" :key="item.label"><div class="bg-field p-3"><dt class="text-xs uppercase text-muted">{{ item.label }}</dt><dd class="mt-1 break-words font-semibold text-primary">{{ formatValue(item.value) }}</dd></div></template></dl></div><div v-if="preview" class="rounded-lg border border-warning/30 bg-warning/5 p-4"><h2 class="text-lg font-semibold text-warning">{{ t('profitSweep.preview') }}</h2><p class="mt-2 text-sm text-secondary">{{ t('profitSweep.previewHint') }}</p><dl class="mt-3 grid grid-cols-2 gap-3 text-sm"><template v-for="key in ['amount', 'reason', 'net_pnl', 'high_watermark', 'sweep_due', 'effective_cap']" :key="key"><div><dt class="text-xs uppercase text-muted">{{ previewLabel(key) }}</dt><dd class="font-semibold text-primary">{{ formatValue((preview.decision as Record<string, unknown> | undefined)?.[key]) }}</dd></div></template></dl></div></section>
        <section v-else-if="['policy', 'schedule', 'vault'].includes(activeTab)" class="mt-4 rounded-lg border border-border-default bg-panel p-4">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-primary">{{ t(`profitSweep.tabs.${activeTab}`) }}</h2>
              <p class="text-sm text-secondary">{{ t('profitSweep.formHint') }}</p>
            </div>
            <Button variant="primary" :disabled="!selectedUser || actionPending" @click="savePolicy">
              <PbIcon :icon="PhFloppyDisk" /> {{ t('profitSweep.save') }}
            </Button>
          </div>
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div v-for="field in fieldsFor(activeTab)" :key="field" class="grid gap-1.5">
              <Label :for="`profit-sweep-${field}`" class="text-xs font-semibold uppercase tracking-label text-secondary">
                {{ fieldLabel(field) }}
              </Label>
              <SelectRoot
                v-if="fieldOptions(field).length"
                :model-value="String(fieldValue(field) ?? '')"
                @update:model-value="setField(field, $event)"
              >
                <SelectTrigger :id="`profit-sweep-${field}`" class="h-9 rounded-md bg-field text-primary">
                  <span :class="fieldValue(field) ? undefined : 'text-placeholder'">
                    {{ fieldLabel(String(fieldValue(field) ?? '')) }}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in fieldOptions(field)"
                    :key="String(option)"
                    :value="String(option)"
                  >
                    {{ fieldLabel(String(option)) }}
                  </SelectItem>
                </SelectContent>
              </SelectRoot>
              <Label
                v-else-if="typeof fieldValue(field) === 'boolean'"
                :for="`profit-sweep-${field}`"
                class="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border-default bg-field px-2.5 text-sm font-normal normal-case tracking-normal text-primary hover:border-border-strong"
              >
                <Checkbox
                  :id="`profit-sweep-${field}`"
                  :model-value="Boolean(fieldValue(field))"
                  @update:model-value="setField(field, $event === true)"
                />
                <span>{{ t('profitSweep.enabled') }}</span>
              </Label>
              <Input
                v-else
                :id="`profit-sweep-${field}`"
                class="h-9 rounded-md bg-field"
                :type="typeof fieldValue(field) === 'number' ? 'number' : 'text'"
                :value="String(fieldValue(field) ?? '')"
                @input="setInputField(field, $event)"
              />
            </div>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" :disabled="currentMode === 'disabled' || actionPending" @click="setMode('disabled')">{{ t('profitSweep.disable') }}</Button>
            <Button variant="primary" :disabled="!record || schema.live_available !== true || actionPending" @click="enableLive"><PbIcon :icon="PhWarning" /> {{ t('profitSweep.enableLive') }}</Button>
          </div>
        </section>
        <section v-else class="mt-4 grid gap-4"><div class="rounded-lg border border-border-default bg-panel p-4"><div class="mb-3 flex items-center justify-between"><h2 class="text-lg font-semibold text-primary">{{ t('profitSweep.journal') }}</h2><Button size="sm" @click="loadAccount(selectedUser)">{{ t('common.refresh') }}</Button></div><div class="overflow-auto"><table class="w-full min-w-[720px] text-left text-sm"><thead><tr class="border-b border-border-default text-xs uppercase text-secondary"><th class="p-2">{{ t('profitSweep.time') }}</th><th class="p-2">{{ t('profitSweep.decision') }}</th><th class="p-2">{{ t('profitSweep.amount') }}</th><th class="p-2">{{ t('profitSweep.netPnl') }}</th><th class="p-2">{{ t('profitSweep.due') }}</th></tr></thead><tbody><tr v-for="entry in journal" :key="`${entry.created_at}-${entry.amount}`" class="border-b border-border-subtle"><td class="p-2">{{ formatTime(entry.created_at) }}</td><td class="p-2" :class="Number(entry.amount) > 0 ? 'text-warning' : 'text-primary'">{{ Number(entry.amount) > 0 ? t('profitSweep.wouldTransfer') : fieldLabel(String(entry.reason || '-')) }}</td><td class="p-2">{{ formatValue(entry.amount) }}</td><td class="p-2">{{ formatValue(entry.net_pnl) }}</td><td class="p-2">{{ formatValue(entry.due_after) }}</td></tr><tr v-if="!journal.length"><td colspan="5" class="p-6 text-center text-secondary">{{ t('profitSweep.noJournal') }}</td></tr></tbody></table></div></div><div class="rounded-lg border border-border-default bg-panel p-4"><h2 class="mb-3 text-lg font-semibold text-primary">{{ t('profitSweep.intents') }}</h2><div class="overflow-auto"><table class="w-full min-w-[720px] text-left text-sm"><thead><tr class="border-b border-border-default text-xs uppercase text-secondary"><th class="p-2">{{ t('profitSweep.operation') }}</th><th class="p-2">{{ t('profitSweep.state') }}</th><th class="p-2">{{ t('profitSweep.route') }}</th><th class="p-2">{{ t('profitSweep.amount') }}</th><th class="p-2">{{ t('profitSweep.action') }}</th></tr></thead><tbody><tr v-for="intent in intents" :key="intent.operation_id" class="border-b border-border-subtle"><td class="p-2">{{ intent.operation_id }}</td><td class="p-2">{{ fieldLabel(String(intent.state || 'unknown')) }}</td><td class="p-2">{{ formatValue(intent.route) }}</td><td class="p-2">{{ formatValue(intent.reserved_amount) }}</td><td class="p-2"><Button v-if="intent.can_reconcile" size="sm" variant="warning" @click="reconcile(intent)">{{ t('profitSweep.reconcile') }}</Button><span v-else>-</span></td></tr><tr v-if="!intents.length"><td colspan="5" class="p-6 text-center text-secondary">{{ t('profitSweep.noIntents') }}</td></tr></tbody></table></div></div></section>
      </main>
    </div>
  </AppShell>
</template>

<style scoped>
.profit-sweep-shell :deep(.app-shell__main) { min-width: 0; width: 100%; max-width: none; padding: 0; }
.profit-sweep-shell :deep(.app-shell__primary) { min-height: 0; }
</style>
