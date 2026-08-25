<script setup lang="ts">
import { PhX } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';

/**
 * CoinMultiSelect — the .ms-wrap contract of the backtest editor
 * (editor_shared createMultiselectController via v7_backtest.html
 * :3498-3553): tag chips, search dropdown, the ★ all exclusive value,
 * select-all/clear helpers and market-label display. Options come from
 * loadCfgSymbols (:3735-3790).
 *
 * Dropdown deviation from the legacy toggle list (2026-08-25): already
 * selected values are NOT offered in the dropdown — every listed option
 * adds on click, removal happens through the chip × / clear-all. The
 * template config ships pre-selected exchanges (['binance','bybit']), and
 * with selected entries listed the "first item" was always an already
 * selected one: clicking it (or Enter on filtered[0]) silently REMOVED
 * it, which read as "the selection disappears". Selected values now live
 * exclusively in the chips.
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
    /** Tooltip text for the field label (data-tip layer). */
    tip?: string;
  }>(),
  { labels: () => ({}), placeholder: '', allowAll: false, selectAllButton: false, tip: '' }
);

const { t } = useI18n();
const filter = ref('');
const open = ref(false);

function display(value: string): string {
  return props.labels[value] ?? value;
}

/** Selectable entries — selected values live in the chips, the dropdown
 *  only offers additions (see the header comment). */
const filtered = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  return props.options.filter((option) => {
    if (isSelected(option)) return false;
    if (!needle) return true;
    return option.toLowerCase().includes(needle) || display(option).toLowerCase().includes(needle);
  });
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
    <label :data-tip="tip || undefined">
      <span class="ms-label-name"><slot name="label" /></span>
      <span class="ms-label-actions">
        <!-- The .ms-* hook classes carry live page CSS (App.vue); the Button
             chrome is neutralized by those unlayered rules + h-auto p-0. -->
        <Button v-if="allowAll" type="button" variant="ghost" class="ms-all-btn h-auto p-0" :title="t('v7backtest.selectAll')" :aria-label="t('v7backtest.selectAll')" :aria-pressed="model.includes('all')" style="border: 0; background: transparent; font: inherit; cursor: pointer" @click="setAll">all</Button>
        <Button v-else-if="selectAllButton" type="button" variant="ghost" class="ms-all-btn h-auto p-0" :title="t('v7backtest.selectAll')" :aria-label="t('v7backtest.selectAll')" :aria-pressed="model.length === props.options.length - (props.options.includes('all') ? 1 : 0)" style="border: 0; background: transparent; font: inherit; cursor: pointer" @click="selectAll">all</Button>
        <Button v-if="model.length" type="button" variant="ghost" class="ms-clear-btn h-auto p-0" :title="t('v7backtest.clearAll')" :aria-label="t('v7backtest.clearAll')" style="border: 0; background: transparent; font: inherit; cursor: pointer" @click="clear"><PbIcon :icon="PhX" /></Button>
      </span>
    </label>
    <div :id="id" class="ms-wrap" @focusin="open = true" @focusout="open = false">
      <span v-for="value in model" :key="value" class="ms-tag" :class="{ 'ms-tag-all': value === 'all' }">
        <template v-if="value === 'all'">★ all</template>
        <template v-else>{{ display(value) }}</template>
        <Button type="button" variant="ghost" class="ms-x h-auto p-0" :aria-label="`Remove ${value === 'all' ? 'all' : display(value)}`" :title="`Remove ${value === 'all' ? 'all' : display(value)}`" style="border: 0; background: transparent; padding: 0; font: inherit; cursor: pointer" @mousedown.prevent @click.stop="toggle(value)"><PbIcon :icon="PhX" /></Button>
      </span>
      <Input v-model="filter" :id="id + '-input'" class="ms-input" :placeholder="placeholder || t('v7backtest.typeToSearch')" autocomplete="off" @keydown.enter.prevent="filtered.length ? toggle(filtered[0]!) : undefined" />
      <div :id="id + '-dd'" class="ms-dropdown" :class="{ open }">
        <div v-if="filtered.length === 0" style="padding: 4px 8px; color: var(--text-dim); font-size: var(--fs-xs)">{{ t('v7backtest.noMatches') }}</div>
        <!-- mousedown.prevent keeps focus on the search input so focusout
             cannot close the dropdown before the click lands (macOS
             browsers never move focus to buttons on click). -->
        <Button v-for="option in filtered" :key="option" type="button" variant="ghost" class="ms-option block h-auto w-full justify-start rounded-none" :aria-label="`Select ${option === 'all' ? 'all' : display(option)}`" style="border: 0; background: transparent; text-align: left; font: inherit; cursor: pointer" @mousedown.prevent @click="toggle(option)">
          {{ option === 'all' ? '★ all' : display(option) }}
        </Button>
      </div>
    </div>
  </div>
</template>
