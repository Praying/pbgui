<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * CoinMultiSelect — the .ms-wrap contract of the backtest editor
 * (editor_shared createMultiselectController via v7_backtest.html
 * :3498-3553): tag chips, search dropdown, the ★ all exclusive value,
 * select-all/clear helpers and market-label display. Options come from
 * loadCfgSymbols (:3735-3790).
 */

const model = defineModel<string[]>({ required: true });
const props = withDefaults(
  defineProps<{
    id: string;
    options: readonly string[];
    labels?: Record<string, string>;
    placeholder?: string;
    allowAll?: boolean;
    selectAllButton?: boolean;
  }>(),
  { labels: () => ({}), placeholder: '', allowAll: false, selectAllButton: false }
);

const { t } = useI18n();
const filter = ref('');
const open = ref(false);

function display(value: string): string {
  return props.labels[value] ?? value;
}

const filtered = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return props.options.slice();
  return props.options.filter((option) => option.toLowerCase().includes(needle) || display(option).toLowerCase().includes(needle));
});

function isSelected(value: string): boolean {
  return model.value.includes(value);
}

function toggle(value: string): void {
  if (value === 'all') {
    model.value = ['all'];
    return;
  }
  model.value = isSelected(value) ? model.value.filter((entry) => entry !== value && entry !== 'all') : [...model.value.filter((e) => e !== 'all'), value];
}

function setAll(): void {
  model.value = ['all'];
}

function selectAll(): void {
  model.value = props.options.filter((option) => option !== 'all');
}

function clear(): void {
  model.value = [];
}
</script>

<template>
  <div class="form-group">
    <label>
      <slot name="label" />
      <span v-if="allowAll" class="ms-all-btn" :title="t('v7backtest.selectAll')" @click="setAll">all</span>
      <span v-else-if="selectAllButton" class="ms-all-btn" :title="t('v7backtest.selectAll')" @click="selectAll">all</span>
      <span class="ms-clear-btn" :title="t('v7backtest.clearAll')" @click="clear">×</span>
    </label>
    <div :id="id" class="ms-wrap" @focusin="open = true" @focusout="open = false">
      <span v-for="value in model" :key="value" class="ms-tag" :class="{ 'ms-tag-all': value === 'all' }">
        <template v-if="value === 'all'">★ all</template>
        <template v-else>{{ display(value) }}</template>
        <span class="ms-x" @click="toggle(value)">×</span>
      </span>
      <input v-model="filter" :id="id + '-input'" class="ms-input" :placeholder="placeholder || t('v7backtest.typeToSearch')" autocomplete="off" @keydown.enter.prevent="filtered.length ? toggle(filtered[0]!) : undefined" />
      <div :id="id + '-dd'" class="ms-dropdown" :class="{ open }">
        <div v-if="filtered.length === 0" style="padding: 4px 8px; color: var(--text-dim); font-size: var(--fs-xs)">{{ t('v7backtest.noMatches') }}</div>
        <div v-for="option in filtered" :key="option" class="ms-option" :class="{ selected: isSelected(option) }" @mousedown.prevent="toggle(option)">
          {{ option === 'all' ? '★ all' : display(option) }}
        </div>
      </div>
    </div>
  </div>
</template>
