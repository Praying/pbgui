<script setup lang="ts">
import { PhChartBar, PhClipboardText, PhCopy, PhPencilSimple, PhPlay, PhPlus } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import BacktestRowActionButton from './BacktestRowActionButton.vue';
import { modalBackdropClass, modalBoxClass } from '../lib/uiClasses';
import type { ConfigSummary, SortSpec } from '../types';

/**
 * ConfigsPanel — the configs list of renderConfigs (:1654-1712): name /
 * exchange / strategy filters, sortable headers (thSort/setSort :1714-1737),
 * a checkbox column with select-all, per-row edit / queue / results /
 * duplicate actions, and the delete confirm flow (:5109-5123).
 */

const props = withDefaults(
  defineProps<{
    configs: readonly ConfigSummary[];
    sort?: SortSpec;
    isV8?: boolean;
  }>(),
  { sort: () => ({ col: 'modified', asc: false }), isV8: false }
);

const emit = defineEmits<{
  sort: [column: string];
  edit: [name: string];
  queue: [name: string];
  'view-results': [name: string];
  duplicate: [name: string];
  'delete-selected': [names: string[]];
  'new-config': [];
  filter: [value: string];
  'nothing-selected': [];
}>();

const { t, tm } = useI18n();

function stripLegacyMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

const emptyCopy = computed(() => {
  const [title = '', message = ''] = String(tm('v7backtest.emptyConfigsHtml')).split(/<br\s*\/?\s*>/i);
  return {
    title: stripLegacyMarkup(title),
    message: stripLegacyMarkup(message),
  };
});

const newConfigLabel = computed(() => t('v7backtest.newConfig').replace(/^\s*\+\s*/, ''));

const filter = ref('');
const exchangeFilter = ref('');
const strategyFilter = ref('');
const selected = ref<string[]>([]);

const exchangeOptions = computed(() => {
  const set = new Set<string>();
  for (const entry of props.configs) {
    const ex = entry.exchanges;
    if (Array.isArray(ex)) ex.forEach((value) => set.add(String(value)));
    else if (ex) set.add(String(ex));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
});

const strategyOptions = computed(() => {
  const set = new Set<string>();
  for (const entry of props.configs) if (entry.strategy) set.add(entry.strategy);
  return [...set].sort((a, b) => a.localeCompare(b));
});

const visible = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  let list = props.configs.slice().sort((a, b) => compare(a, b));
  if (needle) list = list.filter((entry) => (entry.name || '').toLowerCase().includes(needle));
  if (exchangeFilter.value) {
    list = list.filter((entry) => {
      const ex = entry.exchanges;
      const values = Array.isArray(ex) ? ex.map(String) : ex ? [String(ex)] : [];
      return values.includes(exchangeFilter.value);
    });
  }
  if (strategyFilter.value) list = list.filter((entry) => (entry.strategy || '') === strategyFilter.value);
  return list;
});

const allSelected = computed(() => visible.value.length > 0 && visible.value.every((entry) => selected.value.includes(entry.name)));

/* Numeric columns must sort by value, not lexically (:1714-1737). */
const NUMERIC_COLS = new Set(['results', 'coins', 'twe_long', 'twe_short']);
function compare(a: ConfigSummary, b: ConfigSummary): number {
  const col = props.sort.col;
  const va = (a as unknown as Record<string, unknown>)[col];
  const vb = (b as unknown as Record<string, unknown>)[col];
  const cmp = NUMERIC_COLS.has(col)
    ? Number(va ?? 0) - Number(vb ?? 0)
    : String(va ?? '').toLowerCase().localeCompare(String(vb ?? '').toLowerCase());
  return props.sort.asc ? cmp : -cmp;
}

function toggleRow(name: string): void {
  selected.value = selected.value.includes(name) ? selected.value.filter((entry) => entry !== name) : [...selected.value, name];
}

function toggleAll(): void {
  selected.value = allSelected.value ? [] : visible.value.map((entry) => entry.name);
}

function selectAll(): void {
  selected.value = visible.value.map((entry) => entry.name);
}

function deselectAll(): void {
  selected.value = [];
}

function deleteSelected(): void {
  emit('delete-selected', selected.value.slice());
}

/* deleteSelectedConfigs (:5109-5123) — confirm + also-delete-results. */
const deleteConfirmOpen = ref(false);
const deleteAlsoResults = ref(false);

function openDeleteConfirm(): void {
  if (selected.value.length === 0) {
    emit('nothing-selected');
    return;
  }
  deleteConfirmOpen.value = true;
}

async function deleteSelectedFlow(run: (names: readonly string[], removeResults: boolean) => void | Promise<void>): Promise<void> {
  const names = selected.value.slice();
  deleteConfirmOpen.value = false;
  await run(names, deleteAlsoResults.value);
  selected.value = [];
}

function exchangeText(entry: ConfigSummary): string {
  return Array.isArray(entry.exchanges) ? entry.exchanges.join(', ') : String(entry.exchanges ?? '');
}

function num(value: number | null | undefined, decimals: number): string {
  return value === null || value === undefined ? '—' : Number(value).toFixed(decimals);
}

/** Trim the noisy ISO microseconds (:47.207418) to YYYY-MM-DD HH:MM. */
function formatDateTime(value: string | undefined): string {
  if (!value) return '—';
  const withTime = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (withTime) return `${withTime[1]}-${withTime[2]}-${withTime[3]} ${withTime[4]}:${withTime[5]}`;
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  return String(value);
}

/** Coin symbols (from the backend coin_list), falling back to the count. */
function coinsText(entry: ConfigSummary): string {
  const list = entry.coin_list;
  if (Array.isArray(list) && list.length) {
    const shown = list.slice(0, 3).join(', ');
    return list.length > 3 ? `${shown} +${list.length - 3}` : shown;
  }
  return entry.coins != null ? String(entry.coins) : '—';
}

function coinsTitle(entry: ConfigSummary): string {
  const list = entry.coin_list;
  return Array.isArray(list) && list.length ? list.join(', ') : coinsText(entry);
}

/** The ctx-sidebar Delete target (App passes store.deleteConfigs). */
let runDelete: (names: readonly string[], removeResults: boolean) => void | Promise<void> = () => undefined;
function bindRun(run: (names: readonly string[], removeResults: boolean) => void | Promise<void>): void {
  runDelete = run;
  openDeleteConfirm();
}

defineExpose({
  deleteSelectedFlow: bindRun,
  selectedCount: computed(() => selected.value.length),
});
</script>

<template>
  <div>
    <div v-if="configs.length > 0" id="configs-toolbar" class="pbgui-list-toolbar mb-2 flex flex-wrap items-center gap-2">
      <Input
        v-model="filter"
        type="text"
        class="w-auto max-w-[220px]"
        :placeholder="t('v7backtest.searchName')"
        data-test="configs-filter"
        @input="emit('filter', filter)"
      />
      <!-- ui-migration: the legacy <option value=""> placeholder rows have no
           reka equivalent — the listboxes offer no reset row; the cleared
           model ('') renders as the trigger label instead. -->
      <SelectRoot v-model="exchangeFilter">
        <SelectTrigger class="w-auto min-w-[120px] max-w-[180px]" data-test="configs-exchange-filter" :title="t('v7backtest.filterExchange')" :aria-label="t('v7backtest.filterExchange')">
          <span :class="exchangeFilter ? '' : 'text-placeholder'">{{ exchangeFilter || t('v7backtest.filterExchange') }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="exchange in exchangeOptions" :key="exchange" :value="exchange">{{ exchange }}</SelectItem>
        </SelectContent>
      </SelectRoot>
      <SelectRoot v-if="isV8" v-model="strategyFilter">
        <SelectTrigger class="w-auto min-w-[120px] max-w-[180px]" data-test="configs-strategy-filter" :title="t('v7backtest.filterStrategy')" :aria-label="t('v7backtest.filterStrategy')">
          <span :class="strategyFilter ? '' : 'text-placeholder'">{{ strategyFilter || t('v7backtest.filterStrategy') }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="strategy in strategyOptions" :key="strategy" :value="strategy">{{ strategy }}</SelectItem>
        </SelectContent>
      </SelectRoot>
      <span class="whitespace-nowrap text-sm text-secondary">{{ t('v7backtest.totalConfigs', { n: visible.length }) }}</span>
      <span class="flex-1"></span>
      <Button type="button" variant="default" class="act-btn h-auto" data-test="configs-select-all" :title="t('v7backtest.selectAllVisible')" @click="selectAll">{{ t('v7backtest.selectAll') }}</Button>
      <Button type="button" variant="default" class="act-btn h-auto" data-test="configs-deselect" :title="t('v7backtest.deselectAll')" @click="deselectAll">{{ t('v7backtest.deselect') }}</Button>
    </div>

    <section
      v-if="configs.length === 0"
      class="empty-state configs-empty-state mx-auto mt-[clamp(20px,7vh,72px)] grid w-[min(720px,calc(100%_-_32px))] grid-cols-[112px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-accent/18 bg-[radial-gradient(circle_at_0%_0%,rgb(var(--accent-rgb)/0.11),transparent_18rem),linear-gradient(145deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-page-rgb)/0.98))] shadow-panel max-[640px]:grid-cols-1"
      data-test="configs-empty"
      aria-live="polite"
    >
      <div class="relative grid min-h-[210px] place-items-center border-r border-accent/14 bg-accent-deep/8 max-[640px]:min-h-[104px] max-[640px]:border-b max-[640px]:border-r-0">
        <div class="grid h-16 w-16 place-items-center rounded-2xl border border-accent/24 bg-page/70 text-accent-soft shadow-[0_14px_32px_rgb(0_0_0/0.3),inset_0_1px_0_rgb(255_255_255/0.1)]">
          <PbIcon :icon="PhClipboardText" :size="30" />
        </div>
        <span class="absolute bottom-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-secondary/65 max-[640px]:bottom-2">{{ isV8 ? 'PBv8' : 'PBv7' }} / 00</span>
      </div>
      <div class="flex min-w-0 flex-col items-start justify-center px-[clamp(24px,5vw,52px)] py-[clamp(28px,5vw,46px)] text-left">
        <span class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-accent-soft">{{ isV8 ? 'PBv8' : 'PBv7' }} · {{ t('v7backtest.configs') }}</span>
        <h2 class="text-[clamp(20px,2.4vw,27px)] font-semibold leading-tight tracking-[-0.035em] text-primary" data-test="configs-empty-title">{{ emptyCopy.title }}</h2>
        <p class="mt-3 max-w-[48ch] text-sm leading-relaxed text-secondary" data-test="configs-empty-message">{{ emptyCopy.message }}</p>
        <Button type="button" variant="primary" class="group mt-6 rounded-full px-5" data-test="configs-empty-new" @click="emit('new-config')">
          <PbIcon :icon="PhPlus" :size="17" />
          {{ newConfigLabel }}
        </Button>
      </div>
    </section>
    <table v-else class="tbl pbgui-list-table configs-tbl">
      <thead>
        <tr>
          <th class="check-col">
            <Checkbox
              :model-value="allSelected"
              :aria-label="t('v7backtest.selectAll')"
              data-test="configs-select-all-check"
              @update:model-value="toggleAll"
            />
          </th>
          <th data-col="name" @click="emit('sort', 'name')">{{ t('v7backtest.name') }}</th>
          <th data-col="exchanges" @click="emit('sort', 'exchanges')">{{ t('v7backtest.exchange') }}</th>
          <th v-if="isV8" data-col="strategy" @click="emit('sort', 'strategy')"><span data-test="strategy-col-header">{{ t('v7backtest.strategy') }}</span></th>
          <th data-col="coins" @click="emit('sort', 'coins')">{{ t('v7backtest.coins') }}</th>
          <th data-col="twe_long" :title="t('v7backtest.tweTooltip')" @click="emit('sort', 'twe_long')">TWE L/S</th>
          <th data-col="start_date" @click="emit('sort', 'start_date')">{{ t('v7backtest.start') }}</th>
          <th data-col="end_date" @click="emit('sort', 'end_date')">{{ t('v7backtest.end') }}</th>
          <th data-col="results" @click="emit('sort', 'results')">{{ t('v7backtest.resultCountHeader') }}</th>
          <th data-col="modified" @click="emit('sort', 'modified')">{{ t('v7backtest.modified') }}</th>
          <th class="actions-column text-center!">{{ t('v7backtest.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="visible.length === 0">
          <td :colspan="isV8 ? 11 : 10" class="empty-state px-5! py-15! text-center text-md text-secondary">{{ t('v7backtest.noConfigsMatch') }}</td>
        </tr>
        <tr v-for="entry in visible" :key="entry.name" :class="{ selected: selected.includes(entry.name) }" @click="toggleRow(entry.name)">
          <td class="check-col">
            <Checkbox :model-value="selected.includes(entry.name)" :aria-label="entry.name" @click.stop @update:model-value="toggleRow(entry.name)" />
          </td>
          <td :title="entry.name">{{ entry.name }}</td>
          <td>{{ exchangeText(entry) }}</td>
          <td v-if="isV8">{{ entry.strategy || '-' }}</td>
          <td :title="coinsTitle(entry)">{{ coinsText(entry) }}</td>
          <td>{{ num(entry.twe_long, 2) }} / {{ num(entry.twe_short, 2) }}</td>
          <td>{{ formatDateTime(entry.start_date) }}</td>
          <td>{{ formatDateTime(entry.end_date) }}</td>
          <td
            :class="entry.results ? 'cursor-pointer font-semibold text-accent-soft' : 'cursor-default font-normal text-disabled'"
            @click.stop="entry.results ? emit('view-results', entry.name) : undefined"
          >
            {{ entry.results ?? 0 }}
          </td>
          <td :title="String(entry.modified || '')">{{ formatDateTime(entry.modified) }}</td>
          <td class="actions-cell" @click.stop>
            <div class="backtest-row-actions">
              <BacktestRowActionButton :icon="PhPencilSimple" :label="t('v7backtest.edit')" data-test="cfg-edit" @click="emit('edit', entry.name)" />
              <BacktestRowActionButton :icon="PhPlay" :label="t('v7backtest.addToQueueTitle')" tone="accent" data-test="cfg-queue" @click="emit('queue', entry.name)" />
              <BacktestRowActionButton :icon="PhChartBar" :label="t('v7backtest.viewResults')" tone="success" :disabled="!entry.results" data-test="cfg-results" @click="emit('view-results', entry.name)" />
              <BacktestRowActionButton :icon="PhCopy" :label="t('v7backtest.duplicateConfig')" data-test="cfg-duplicate" @click="emit('duplicate', entry.name)" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="configs.length > 0" class="px-0.5 pt-2 text-sm text-secondary">{{ t('v7backtest.totalConfigs', { n: visible.length }) }}</div>

    <div v-if="deleteConfirmOpen" id="modal-root" :class="modalBackdropClass" data-test="configs-delete-modal">
      <div :class="modalBoxClass">
        <h3>{{ t('v7backtest.deleteConfigs') }}</h3>
        <p>{{ t('v7backtest.deleteConfigsConfirm', { n: selected.length }) }}</p>
        <label class="sb-toggle"><Checkbox v-model="deleteAlsoResults" /><span>{{ t('v7backtest.alsoDeleteResults') }}</span></label>
        <div class="mt-5 flex justify-end gap-2">
          <Button type="button" variant="default" class="modal-btn" @click="deleteConfirmOpen = false">{{ t('common.cancel') }}</Button>
          <Button type="button" variant="danger" class="modal-btn" data-test="configs-delete-confirm" @click="deleteSelectedFlow(runDelete)">{{ t('common.delete') }}</Button>
        </div>
      </div>
    </div>
  </div>
</template>
