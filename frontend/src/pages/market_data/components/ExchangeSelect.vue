<script setup lang="ts">
/*
 * Page context bar (legacy .page-context-bar with #page-exchange,
 * market_data_main.html:2965-2977) — the exchange select is the page pivot.
 * Persistence is the legacy setContextExchange localStorage write (:7310);
 * the load fan-out (loadSettings/updateStatusPanel/inventory/best1m/
 * integrity, :7314-7333) lands in M-data-2.
 */
import { useI18n } from 'vue-i18n';
import { fieldLabelClass, inputClass, panelCardClass, settingsFieldClass } from '../lib/uiClasses';
import type { ExchangeOption } from '../types';

defineProps<{
  modelValue: string;
  options: readonly ExchangeOption[];
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { t } = useI18n();
</script>

<template>
  <div :class="[panelCardClass, 'page-context-bar flex flex-none flex-wrap items-end gap-3 py-3 px-5']">
    <label :class="[settingsFieldClass, 'page-context-selector min-w-[220px] max-w-[240px]']">
      <span :class="fieldLabelClass">{{ t('market.exchange') }}</span>
      <select id="page-exchange" :class="inputClass" :value="modelValue" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
        <option v-for="option in options" :key="option.key" :value="option.key">{{ option.label }}</option>
      </select>
    </label>
  </div>
</template>
