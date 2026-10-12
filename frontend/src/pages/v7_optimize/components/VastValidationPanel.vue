<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { VastValidationIssue, VastValidationResult } from '../lib/vastApi';

const props = defineProps<{
  result: VastValidationResult | null;
  pending?: boolean;
}>();
const { t } = useI18n();

const issues = computed<Array<VastValidationIssue & { warning: boolean }>>(() => [
  ...(props.result?.errors ?? []).map((issue) => ({ ...issue, warning: false })),
  ...(props.result?.warnings ?? []).map((issue) => ({ ...issue, warning: true })),
]);
</script>

<template>
  <section
    v-if="pending || issues.length"
    class="rounded-lg border px-3 py-2.5"
    :class="result?.errors.length ? 'border-danger/45 bg-danger/10' : 'border-warning/35 bg-warning/10'"
    :aria-busy="pending ? 'true' : 'false'"
    data-test="vast-validation-panel"
  >
    <strong class="text-sm" :class="result?.errors.length ? 'text-danger-soft' : 'text-warning-soft'">
      {{ pending ? t('v7optimize.checkingGpuCompatibility') : result?.errors.length ? t('v7optimize.cloudConfigAttention', { count: result.errors.length }) : t('v7optimize.gpuDirectionHints', { count: result?.warnings.length || 0 }) }}
    </strong>
    <p v-if="!pending" class="mt-1 text-xs leading-5 text-secondary">
      {{ result?.errors.length ? t('v7optimize.cloudValidationBlockingHint') : t('v7optimize.cloudValidationNonBlockingHint') }}
      <span v-if="result?.revision"> {{ t('v7optimize.workerRevision', { revision: result.revision.slice(0, 7) }) }}</span>
    </p>
    <ul v-if="!pending" class="mt-2 grid gap-2">
      <li v-for="(issue, index) in issues" :key="`${issue.path || 'validation'}-${index}`" class="border-t border-border-default/60 pt-2 text-sm">
        <span :class="issue.warning ? 'text-warning-soft' : 'text-danger-soft'">{{ issue.warning ? `${t('v7optimize.hintPrefix')} ` : '' }}{{ issue.message }}</span>
        <small v-if="issue.path" class="mt-0.5 block text-xs text-secondary">{{ t('v7optimize.fieldPath', { path: issue.path }) }}</small>
      </li>
    </ul>
  </section>
</template>
