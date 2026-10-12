<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import type { BacktestMigrationDraft } from '../types';

const props = defineProps<{ draft: BacktestMigrationDraft }>();
const emit = defineEmits<{ decision: [index: number, option: string] }>();
const { t } = useI18n();

const fields = computed(() => [...new Set([
  ...(props.draft.migration_report.manual_review_fields ?? []),
  ...(props.draft.migration_report.dropped_unsupported_fields ?? []),
].map(String).filter(Boolean))]);

const warnings = computed(() => (props.draft.migration_report.behavior_change_warnings ?? []).map(String).filter(Boolean));
const decisions = computed(() => props.draft.migration_report.pbgui_review_decisions ?? []);
const requiresReview = computed(() => props.draft.migration_report.manual_review_required === true || fields.value.length > 0);

function formattedValue(path: string): string {
  const values = props.draft.migration_review_values ?? {};
  return Object.prototype.hasOwnProperty.call(values, path) ? ` = ${JSON.stringify(values[path])}` : '';
}

function decisionIndex(path: string): number {
  return decisions.value.findIndex((decision) => String(decision.path || '') === path && decision.code === 'minimum_coin_age_days');
}

function selectDecision(index: number, option: unknown): void {
  const value = String(option || '');
  if (value === 'pb7_coverage' || value === 'pb8_age_gate') emit('decision', index, value);
}
</script>

<template>
  <section
    class="rounded-xl border px-4 py-3"
    :class="requiresReview ? 'border-warning/45 bg-warning/10' : 'border-info/35 bg-info/10'"
    data-test="migration-review-notice"
    role="status"
  >
    <h2 class="text-md font-bold tracking-tight text-primary">
      {{ requiresReview ? t('v7backtest.migrationReviewRequired') : t('v7backtest.migrationCompleted') }}
    </h2>
    <p class="mt-1 text-sm leading-6 text-secondary">
      {{ draft.migration_message || (fields.length ? t('v7backtest.migrationReviewFields') : t('v7backtest.migrationReviewDraft')) }}
    </p>

    <ul v-if="warnings.length" class="mt-3 grid gap-1.5 text-sm leading-6 text-warning-soft" data-test="migration-warnings">
      <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
    </ul>

    <ul v-if="fields.length" class="mt-3 grid gap-2.5">
      <li v-for="field in fields" :key="field" class="rounded-lg border border-border-default/70 bg-panel/60 p-3">
        <code class="text-compact text-primary">{{ field }}{{ formattedValue(field) }}</code>
        <template v-if="decisionIndex(field) >= 0">
          <p class="mt-1 text-xs leading-5 text-secondary">{{ t('v7backtest.minimumCoinAgeDecisionHint') }}</p>
          <SelectRoot
            :model-value="decisions[decisionIndex(field)]?.selected_option || 'pending'"
            @update:model-value="selectDecision(decisionIndex(field), $event)"
          >
            <SelectTrigger
              class="mt-2 w-full"
              :class="decisions[decisionIndex(field)]?.resolved ? '' : 'border-warning/70'"
              :aria-invalid="decisions[decisionIndex(field)]?.resolved ? undefined : 'true'"
              data-test="migration-minimum-coin-age-decision"
            >
              <span>{{ decisions[decisionIndex(field)]?.selected_option || t('v7backtest.chooseMigrationBehavior') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending" disabled>{{ t('v7backtest.chooseMigrationBehavior') }}</SelectItem>
              <SelectItem value="pb7_coverage">{{ t('v7backtest.keepPb7Coverage') }}</SelectItem>
              <SelectItem value="pb8_age_gate">{{ t('v7backtest.keepPb8AgeGate', { days: decisions[decisionIndex(field)]?.pb8_age_gate_value ?? 0 }) }}</SelectItem>
            </SelectContent>
          </SelectRoot>
        </template>
      </li>
    </ul>
  </section>
</template>
