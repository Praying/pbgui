<script setup lang="ts">
/*
 * Page context bar (legacy .page-context-bar with #page-exchange,
 * market_data_main.html:2965-2977) — the exchange select is the page pivot.
 * Persistence is the legacy setContextExchange localStorage write (:7310);
 * the load fan-out (loadSettings/updateStatusPanel/inventory/best1m/
 * integrity, :7314-7333) lands in M-data-2.
 */
import { useI18n } from 'vue-i18n';
import type { ExchangeOption } from '../types';

defineProps<{
  modelValue: string;
  options: readonly ExchangeOption[];
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { t } = useI18n();
</script>

<template>
  <div class="panel-card page-context-bar">
    <label class="settings-field page-context-selector">
      <span class="field-label">{{ t('market.exchange') }}</span>
      <select id="page-exchange" :value="modelValue" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
        <option v-for="option in options" :key="option.key" :value="option.key">{{ option.label }}</option>
      </select>
    </label>
  </div>
</template>
