<script setup lang="ts">
/*
 * The TradFi action feedback box — legacy renderTradfiActionResult
 * (market_data_main.html:5754-5803). Normalization happens in the
 * controller (setActionResult); this renders the normalized shape.
 */
import { useI18n } from 'vue-i18n';
import type { TradfiActionResult } from '../../composables/useTradfiMap';

defineProps<{
  result: TradfiActionResult;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="tradfi-feedback" :class="result.level">
    <div class="tradfi-feedback-header">
      <div class="tradfi-search-title">{{ result.title }}</div>
      <button
        class="tradfi-feedback-close"
        type="button"
        :aria-label="t('market.closeActionResult')"
        @click="emit('close')"
      >✕</button>
    </div>
    <div v-for="(line, index) in result.details" :key="index" class="tradfi-search-meta">
      {{ line }}
    </div>
    <template v-for="(group, index) in result.groups" :key="index">
      <div v-if="!group.items.length" class="tradfi-search-meta">{{ group.label }}: {{ group.count }}</div>
      <details v-else class="tradfi-feedback-group">
        <summary>
          <span class="tradfi-feedback-group-title">{{ group.label }}: {{ group.count }}</span>
          <span class="tradfi-feedback-group-hint">{{ t('market.clickToExpand') }}</span>
        </summary>
        <div class="tradfi-feedback-group-list">
          <div v-for="(item, itemIndex) in group.items" :key="itemIndex" class="tradfi-feedback-group-item">
            {{ item }}
          </div>
        </div>
      </details>
    </template>
  </div>
</template>
