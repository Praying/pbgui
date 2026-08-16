<script setup lang="ts">
/*
 * The .summary-grid card list — appendIntegritySummaryCard
 * (market_data_main.html:4278-4292); shared by the panel header and the
 * gap modal (:4667-4673).
 */
import type { SummaryCard } from '../../lib/integrityView';

defineProps<{
  cards: readonly SummaryCard[];
  id?: string;
}>();
</script>

<template>
  <div class="summary-grid" :id="id">
    <div v-for="card in cards" :key="card.label" class="summary-card">
      <div class="summary-label">{{ card.label }}</div>
      <div class="summary-value">{{ card.value }}</div>
      <div class="note">{{ card.note }}</div>
    </div>
  </div>
</template>
