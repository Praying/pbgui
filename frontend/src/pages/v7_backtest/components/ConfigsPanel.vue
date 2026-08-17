<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ConfigSummary, SortSpec } from '../types';

/**
 * ConfigsPanel — the configs list of renderConfigs (:1654-1712) with the
 * toolbar (filter + select all/deselect, :813-818), sortable headers
 * (thSort/setSort/sortFn :1714-1737), row selection and the per-row
 * edit/queue/results actions. The v7 Convert-to-V8 button (:1685-1686)
 * lands with the M-v7-12 migration flows.
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
  'delete-selected': [names: string[]];
  'new-config': [];
  filter: [value: string];
  'nothing-selected': [];
}>();

const { t } = useI18n();

const filter = ref('');
const selected = ref<string[]>([]);

const visible = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  const sorted = props.configs.slice().sort((a, b) => compare(a, b));
  return needle ? sorted.filter((entry) => (entry.name || '').toLowerCase().includes(needle)) : sorted;
});

/** sortFn (:1726-1737). */
function compare(a: ConfigSummary, b: ConfigSummary): number {
  const col = props.sort.col;
  let va: string | number = String((a as unknown as Record<string, unknown>)[col] ?? '');
  let vb: string | number = String((b as unknown as Record<string, unknown>)[col] ?? '');
  if (typeof va === 'string') va = va.toLowerCase();
  if (typeof vb === 'string') vb = vb.toLowerCase();
  if (va < vb) return props.sort.asc ? -1 : 1;
  if (va > vb) return props.sort.asc ? 1 : -1;
  return 0;
}

function toggleRow(name: string): void {
  selected.value = selected.value.includes(name) ? selected.value.filter((entry) => entry !== name) : [...selected.value, name];
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

function dateText(value: string | undefined): string {
  return value || '—';
}

/** The ctx-sidebar Delete target (App passes store.deleteConfigs). */
let runDelete: (names: readonly string[], removeResults: boolean) => void | Promise<void> = () => undefined;
function bindRun(run: (names: readonly string[], removeResults: boolean) => void | Promise<void>): void {
  runDelete = run;
  openDeleteConfirm();
}

defineExpose({ deleteSelectedFlow: bindRun });
</script>

<template>
  <div>
    <div id="configs-toolbar" style="display: flex; gap: var(--sp-sm); align-items: center; margin-bottom: var(--sp-sm)">
      <input
        v-model="filter"
        type="text"
        class="sb-input"
        style="max-width: 240px"
        :placeholder="t('v7backtest.searchName')"
        data-test="configs-filter"
        @input="emit('filter', filter)"
      />
      <span style="flex: 1"></span>
      <button type="button" class="act-btn" data-test="configs-select-all" :title="t('v7backtest.selectAllVisible')" @click="selectAll">{{ t('v7backtest.selectAll') }}</button>
      <button type="button" class="act-btn" data-test="configs-deselect" :title="t('v7backtest.deselectAll')" @click="deselectAll">{{ t('v7backtest.deselect') }}</button>
    </div>

    <div v-if="configs.length === 0" class="empty-state">
      <div class="empty-icon">📋</div>
      <p>{{ t('v7backtest.emptyConfigsHtml') }}</p>
    </div>
    <table v-else class="tbl">
      <thead>
        <tr>
          <th data-col="name" @click="emit('sort', 'name')">{{ t('v7backtest.name') }}</th>
          <th data-col="exchanges" @click="emit('sort', 'exchanges')">{{ t('v7backtest.exchange') }}</th>
          <th v-if="isV8" data-col="strategy" @click="emit('sort', 'strategy')"><span data-test="strategy-col-header">{{ t('v7backtest.strategy') }}</span></th>
          <th data-col="coins" @click="emit('sort', 'coins')">{{ t('v7backtest.coins') }}</th>
          <th data-col="twe_long" @click="emit('sort', 'twe_long')">TWE L/S</th>
          <th data-col="start_date" @click="emit('sort', 'start_date')">{{ t('v7backtest.start') }}</th>
          <th data-col="end_date" @click="emit('sort', 'end_date')">{{ t('v7backtest.end') }}</th>
          <th data-col="results" @click="emit('sort', 'results')">{{ t('v7backtest.results') }}</th>
          <th data-col="modified" @click="emit('sort', 'modified')">{{ t('v7backtest.modified') }}</th>
          <th>{{ t('v7backtest.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="visible.length === 0">
          <td colspan="10" class="empty-state">{{ t('v7backtest.noConfigsMatch') }}</td>
        </tr>
        <tr v-for="entry in visible" :key="entry.name" :class="{ selected: selected.includes(entry.name) }" @click="toggleRow(entry.name)">
          <td :title="entry.name">{{ entry.name }}</td>
          <td>{{ exchangeText(entry) }}</td>
          <td v-if="isV8">{{ entry.strategy || '-' }}</td>
          <td>{{ entry.coins ?? '' }}</td>
          <td>{{ num(entry.twe_long, 2) }} / {{ num(entry.twe_short, 2) }}</td>
          <td>{{ dateText(entry.start_date) }}</td>
          <td>{{ dateText(entry.end_date) }}</td>
          <td style="cursor: pointer; color: #63b3ed; font-weight: 600" @click.stop="emit('view-results', entry.name)">{{ entry.results ?? 0 }}</td>
          <td>{{ dateText(entry.modified) }}</td>
          <td class="actions-cell" @click.stop>
            <button type="button" class="act-btn" data-test="cfg-edit" :title="t('v7backtest.edit')" @click="emit('edit', entry.name)">✏️</button>
            <button type="button" class="act-btn" data-test="cfg-queue" :title="t('v7backtest.addToQueueTitle')" @click="emit('queue', entry.name)">▶</button>
            <button type="button" class="act-btn" data-test="cfg-results" :title="t('v7backtest.viewResults')" @click="emit('view-results', entry.name)">📊</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="deleteConfirmOpen" id="modal-root" data-test="configs-delete-modal">
      <div class="modal-box">
        <h3>{{ t('v7backtest.deleteConfigs') }}</h3>
        <p>{{ t('v7backtest.deleteConfigsConfirm', { n: selected.length }) }}</p>
        <label class="sb-toggle"><input v-model="deleteAlsoResults" type="checkbox" /><span>{{ t('v7backtest.alsoDeleteResults') }}</span></label>
        <div class="modal-actions">
          <button type="button" class="modal-btn" @click="deleteConfirmOpen = false">{{ t('common.cancel') }}</button>
          <button type="button" class="modal-btn modal-btn-danger" data-test="configs-delete-confirm" @click="deleteSelectedFlow(runDelete)">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
