<script setup lang="ts">
/*
 * The .summary-grid card list — appendIntegritySummaryCard
 * (market_data_main.html:4278-4292); shared by the panel header and the
 * gap modal (:4667-4673).
 */
import { noteClass } from '../../lib/uiClasses';
import type { SummaryCard } from '../../lib/integrityView';

defineProps<{
  cards: readonly SummaryCard[];
  id?: string;
}>();

const summaryCardClass =
  'summary-card grid gap-1 rounded-[10px] border border-accent/18 bg-page/48 p-3';
</script>

<template>
  <div class="summary-grid grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]" :id="id">
    <div v-for="card in cards" :key="card.label" :class="summaryCardClass">
      <div class="summary-label text-xs uppercase tracking-[0.08em] text-secondary">{{ card.label }}</div>
      <div class="summary-value text-md font-bold text-primary break-words">{{ card.value }}</div>
      <div :class="noteClass">{{ card.note }}</div>
    </div>
  </div>
</template>
