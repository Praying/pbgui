<script setup lang="ts">
/**
 * ResultDetailsDialog — a focused reading surface for one backtest result.
 * Keeping charts, JSON and generated images in an overlay leaves the results
 * table with the full workspace height instead of making the table compete
 * with an ever-growing inline report.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal } from '@/shared/components/ui/modal';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { PhChartLineUp } from '@phosphor-icons/vue';
import ResultCharts from './ResultCharts.vue';
import type { ResultDataApi, ResultsSection } from '../composables/useResults';
import type { ResultActionKind, BacktestVersion } from '../types';

const props = defineProps<{
  open: boolean;
  section: ResultsSection | null;
  version: BacktestVersion;
  dataApi: ResultDataApi;
  action: ResultActionKind | null;
}>();

const emit = defineEmits<{ 'update:open': [open: boolean] }>();
const { t } = useI18n();

const resultVersion = computed(() => props.section?.result.backtest_version ?? props.version);
const actionLabel = computed(() => {
  if (!props.action) return t('v7backtest.results');
  if (props.action === 'plot') return t('v7backtest.plotImages', { version: resultVersion.value.toUpperCase() });
  if (props.action === 'fills') return t('v7backtest.fillsPlots');
  if (props.action === 'analysis') return t('v7backtest.analysisJson');
  if (props.action === 'config') return t('v7backtest.configJson');
  return t('v7backtest.viewChartsTitle');
});

const resultLabel = computed(() => {
  const result = props.section?.result;
  if (!result) return '';
  return result.display_name || `${result.config_name}/${result.exchange_dir || ''}/${result.result_name}`;
});

function close(): void {
  emit('update:open', false);
}
</script>

<template>
  <Modal
    :open="props.open && props.section !== null"
    panel-class="result-details-dialog h-[min(900px,calc(100dvh-2rem))] w-[min(1180px,96vw)]"
    :title="actionLabel"
    :backdrop-close="false"
    :close-label="t('common.close')"
    @update:open="emit('update:open', $event)"
  >
    <template #title>
      <div class="flex min-w-0 items-center gap-3">
        <span class="grid size-8 shrink-0 place-items-center rounded-lg border border-accent/22 bg-accent/10 text-accent-soft">
          <PbIcon :icon="PhChartLineUp" :size="17" />
        </span>
        <span class="min-w-0">
          <span class="block truncate text-md font-bold text-primary">{{ resultLabel }}</span>
          <span class="mt-0.5 block text-xs font-medium text-muted">{{ actionLabel }}</span>
        </span>
      </div>
    </template>

    <div v-if="props.section" class="result-details-dialog__body">
      <div class="flex flex-wrap items-center gap-2 border-b border-border-subtle pb-3 text-xs text-secondary">
        <span class="rounded-md border border-accent/20 bg-accent/8 px-2 py-1 font-mono font-semibold text-accent-soft">
          PB{{ props.section.result.backtest_version.toUpperCase() }}
        </span>
        <span v-if="props.section.result.strategy" class="rounded-md border border-border-subtle bg-card px-2 py-1">
          {{ props.section.result.strategy }}
        </span>
        <span class="font-mono text-muted">{{ props.section.result.exchange_dir || t('v7backtest.exch') }}</span>
        <span v-if="props.section.result.liquidated" class="rounded-md border border-danger/30 bg-danger/10 px-2 py-1 font-semibold text-danger-soft">
          {{ t('v7backtest.liquidated') }}
        </span>
      </div>

      <ResultCharts
        :key="props.action ?? 'result'"
        charts-id="result-details-content"
        :sections="[props.section]"
        :version="resultVersion"
        :data-api="props.dataApi"
      />
    </div>

    <template #footer>
      <Button type="button" variant="ghost" size="sm" class="text-secondary underline decoration-border-strong underline-offset-4 hover:text-primary" @click="close">
        {{ t('common.close') }}
      </Button>
    </template>
  </Modal>
</template>

<style>
/* The result dialog keeps the report roomy while using a compact 48px
   header. The selector is intentionally scoped by the panel class because
   the shared Modal header remains appropriately spacious for form dialogs. */
.result-details-dialog > div:first-child {
  padding-top: 8px;
  padding-bottom: 8px;
}
</style>
