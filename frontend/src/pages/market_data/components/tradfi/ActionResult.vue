<script setup lang="ts">
/*
 * The TradFi action feedback box — legacy renderTradfiActionResult
 * (market_data_main.html:5754-5803). Normalization happens in the
 * controller (setActionResult); this renders the normalized shape.
 */
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import type { TradfiActionResult } from '../../composables/useTradfiMap';

defineProps<{
  result: TradfiActionResult;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

/** The former .tradfi-feedback + .{success,warn,error} rules — complete
 *  colour set per level (the base rule's tint never rides along). */
const FEEDBACK_TONE: Record<string, string> = {
  success: 'success border-success/35 bg-success/8',
  warn: 'warn border-warning/35 bg-warning/8',
  warning: 'warn border-warning/35 bg-warning/8',
  error: 'error border-danger/35 bg-danger/8',
};

function feedbackClass(level: string): string {
  const tone = FEEDBACK_TONE[level] ?? 'border-accent/20 bg-page/45';
  return `tradfi-feedback ${level} grid gap-2 rounded-[10px] border p-3 ${tone}`;
}
</script>

<template>
  <div :class="feedbackClass(result.level)">
    <div class="tradfi-feedback-header flex flex-wrap items-start justify-between gap-2">
      <div class="tradfi-search-title text-base font-bold text-primary">{{ result.title }}</div>
      <Button
        class="tradfi-feedback-close flex-none h-8 w-8 p-0 text-md"
        variant="outline"
        type="button"
        :aria-label="t('market.closeActionResult')"
        @click="emit('close')"
      >✕</Button>
    </div>
    <div v-for="(line, index) in result.details" :key="index" class="tradfi-search-meta text-sm text-secondary">
      {{ line }}
    </div>
    <template v-for="(group, index) in result.groups" :key="index">
      <div v-if="!group.items.length" class="tradfi-search-meta text-sm text-secondary">{{ group.label }}: {{ group.count }}</div>
      <details v-else class="tradfi-feedback-group overflow-hidden rounded-[10px] border border-secondary/12 bg-page/32">
        <summary class="flex cursor-pointer list-none items-center justify-between gap-2 py-2 pl-3 pr-3 [&::-webkit-details-marker]:hidden">
          <span class="tradfi-feedback-group-title text-sm font-semibold text-primary">{{ group.label }}: {{ group.count }}</span>
          <span class="tradfi-feedback-group-hint text-xs whitespace-nowrap text-secondary">{{ t('market.clickToExpand') }}</span>
        </summary>
        <div class="tradfi-feedback-group-list grid max-h-[220px] gap-1 overflow-auto px-3 py-2">
          <div v-for="(item, itemIndex) in group.items" :key="itemIndex" class="tradfi-feedback-group-item text-sm leading-[1.5] text-secondary break-words">
            {{ item }}
          </div>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
/* .tradfi-feedback-group[open] > summary — an attribute-state rule on the
   parent details that paints the summary's border; utilities cannot
   express "style me while my parent is open". 'tradfi-feedback-group'
   remains the inert anchor. */
.tradfi-feedback-group[open] > summary {
  border-bottom: 1px solid rgb(var(--text-secondary-rgb) / 0.12);
}
</style>
