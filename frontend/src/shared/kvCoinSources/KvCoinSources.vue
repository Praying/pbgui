<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * KvCoinSources — the kv chip editor port (v7_backtest.html:3808-4012):
 * a coin → exchange map rendered as sorted chips plus an exchange select
 * and a coin-search dropdown (kvInit/kvAdd/kvRemove/kvShowDd/kvLoadCoins).
 * The parent owns the map (v-model) and the symbols loader, so the
 * component stays page-agnostic (reused by the suite scenario editor).
 */

const model = defineModel<Record<string, string>>({ required: true });
const props = withDefaults(
  defineProps<{
    exchangeOptions: readonly string[];
    /** v8 keeps full market identifiers; v7 upper-cases coin keys (:3854). */
    preserveCase?: boolean;
    /** kvLoadCoins (:3881-3940) — resolves { symbols, catalog? }. */
    loadSymbols?(exchange: string): Promise<{ symbols: string[]; catalog?: Record<string, string> }>;
  }>(),
  { preserveCase: false, loadSymbols: undefined }
);

const { t } = useI18n();

const exchange = ref(props.exchangeOptions[0] ?? '');
const filter = ref('');
const open = ref(false);
const symbolCache = new Map<string, { symbols: string[]; labels: Record<string, string> }>();
const symbols = ref<{ symbols: string[]; labels: Record<string, string> }>({ symbols: [], labels: {} });
const loading = ref(false);

const entries = computed(() => Object.keys(model.value).sort());

async function loadFor(exchangeName: string): Promise<void> {
  if (!props.loadSymbols || !exchangeName) return;
  const cached = symbolCache.get(exchangeName);
  if (cached) {
    symbols.value = cached;
    return;
  }
  loading.value = true;
  try {
    const data = await props.loadSymbols(exchangeName);
    const labels: Record<string, string> = {};
    for (const [id, label] of Object.entries(data.catalog ?? {})) labels[id] = label;
    const entry = { symbols: (data.symbols ?? []).slice().sort(), labels };
    symbolCache.set(exchangeName, entry);
    symbols.value = entry;
  } catch {
    const entry = { symbols: [], labels: {} };
    symbolCache.set(exchangeName, entry);
    symbols.value = entry;
  } finally {
    loading.value = false;
  }
}

onMounted(() => void loadFor(exchange.value));
watch(exchange, (next) => void loadFor(next));

const visible = computed(() => {
  const needle = filter.value.trim().toUpperCase();
  const list = symbols.value.symbols.filter((symbol) => !needle || symbol.toUpperCase().includes(needle));
  return list.slice(0, 200);
});

/** kvAdd (:3851-3863) — add or swap the coin's exchange. */
function add(coin: string): void {
  let key = String(coin ?? '').trim();
  if (!key) return;
  if (!props.preserveCase) key = key.toUpperCase();
  model.value = { ...model.value, [key]: exchange.value };
  filter.value = '';
}

function remove(coin: string): void {
  const next = { ...model.value };
  delete next[coin];
  model.value = next;
}

function clearAll(): void {
  model.value = {};
}

function labelFor(symbol: string): string {
  return symbols.value.labels[symbol] ?? symbol;
}

function onEnter(): void {
  const first = visible.value.find((symbol) => model.value[symbol] === undefined);
  if (first) add(first);
}
</script>

<template>
  <div>
    <div class="kv-chips" data-test="kv-chips">
      <span v-if="entries.length === 0" style="color: var(--text-dim); font-size: var(--fs-xs)">{{ t('v7backtest.noEntries') }}</span>
      <span v-for="coin in entries" :key="coin" class="kv-chip">
        <span class="kv-chip-ex">{{ model[coin] }}</span>
        {{ coin }}
        <span class="ms-x" :title="t('v7backtest.delete')" @click="remove(coin)">×</span>
      </span>
    </div>
    <div style="display: flex; gap: var(--sp-sm); align-items: end; margin-top: var(--sp-xs)">
      <div class="form-group" style="width: 140px">
        <label>{{ t('v7backtest.exchange') }}</label>
        <select v-model="exchange" class="form-input">
          <option v-for="option in exchangeOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </div>
      <div class="form-group" style="flex: 1">
        <label>
          {{ t('v7backtest.coin') }}
          <span class="ms-clear-btn" data-test="kv-clear-all" :title="t('v7backtest.clearAll')" @click="clearAll">× all</span>
        </label>
        <div class="ms-wrap" @focusin="open = true" @focusout="open = false">
          <input
            v-model="filter"
            class="ms-input"
            :placeholder="t('v7backtest.typeToSearch')"
            autocomplete="off"
            @keydown.enter.prevent="onEnter"
          />
          <div class="ms-dropdown" :class="{ open }">
            <div v-if="visible.length === 0" style="padding: 4px 8px; color: var(--text-dim); font-size: var(--fs-xs)">{{ t('v7backtest.noMatches') }}</div>
            <div
              v-for="symbol in visible"
              :key="symbol"
              class="ms-option"
              :class="{ selected: model[symbol] === exchange, 'in-other': model[symbol] !== undefined && model[symbol] !== exchange }"
              @mousedown.prevent="add(symbol)"
            >
              {{ labelFor(symbol) }}
              <template v-if="model[symbol] === exchange"> ✓</template>
              <template v-else-if="model[symbol] !== undefined"> @ {{ model[symbol] }} ⇄</template>
            </div>
          </div>
        </div>
      </div>
    </div>
    <span data-test="kv-count" style="display: none">{{ entries.length }}</span>
  </div>
</template>
