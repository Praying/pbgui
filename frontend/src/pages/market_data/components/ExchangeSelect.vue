<script setup lang="ts">
/*
 * Page context bar (legacy .page-context-bar with #page-exchange,
 * market_data_main.html:2965-2977) — the exchange select is the page pivot.
 * Persistence is the legacy setContextExchange localStorage write (:7310);
 * the load fan-out (loadSettings/updateStatusPanel/inventory/best1m/
 * integrity, :7314-7333) lands in M-data-2.
 */
import { useI18n } from 'vue-i18n';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import { fieldLabelClass, panelCardClass, settingsFieldClass } from '../lib/uiClasses';
import type { ExchangeOption } from '../types';

const props = defineProps<{
  modelValue: string;
  options: readonly ExchangeOption[];
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { t } = useI18n();

function onSelect(value: unknown): void {
  emit('update:modelValue', String(value ?? ''));
}

/* Trigger label renders from the model — the listbox options are lazily
   mounted, so there is no option text to read for a set value. */
function labelFor(key: string): string {
  return props.options.find((option) => option.key === key)?.label ?? key;
}
</script>

<template>
  <div :class="[panelCardClass, 'page-context-bar flex flex-none flex-wrap items-end gap-3 py-3 px-5']">
    <label :class="[settingsFieldClass, 'page-context-selector min-w-[220px] max-w-[240px]']">
      <span :class="fieldLabelClass" id="page-exchange-label">{{ t('market.exchange') }}</span>
      <SelectRoot :model-value="modelValue" @update:model-value="onSelect">
        <SelectTrigger id="page-exchange" aria-labelledby="page-exchange-label">
          <span>{{ labelFor(modelValue) }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="option in options" :key="option.key" :value="option.key">{{ option.label }}</SelectItem>
        </SelectContent>
      </SelectRoot>
    </label>
  </div>
</template>
