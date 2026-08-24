<script setup lang="ts">
/*
 * Tiingo usage cards — legacy renderTiingoUsage (market_data_main.html
 * :5676-5723). Numeric normalization lives in lib/tiingoUsage.ts.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { calloutClass } from '../../lib/uiClasses';
import { formatDurationCompact } from '../../lib/tradfiFormat';
import { toTiingoUsageModel, type TiingoUsage } from '../../lib/tiingoUsage';

const props = defineProps<{
  usage: TiingoUsage | null;
  configured: boolean;
}>();

const { t } = useI18n();

const model = computed(() => toTiingoUsageModel(props.usage));

const calloutText = computed<string>(() => {
  let text = t('market.tiingoUsageCallout'); // :5697
  if (model.value.isExceeded) {
    text += t('market.tiingoExceededSuffix', {
      time: formatDurationCompact(model.value.waitRemainingSeconds),
    });
  }
  return text;
});

/** The former .usage-card rule (legacy :2173+). */
const usageCardClass =
  'usage-card grid gap-1 rounded-[10px] border border-elevated bg-page/45 p-3';
</script>

<template>
  <div v-if="!configured" class="settings-empty py-2 text-base text-secondary">{{ t('market.tiingoConfigureProfile') }}</div>
  <template v-else>
    <div :class="[calloutClass(model.isExceeded), 'mb-3']">
      {{ calloutText }}
    </div>
    <div class="usage-grid grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      <div :class="usageCardClass">
        <div class="usage-title text-sm font-semibold text-primary">{{ t('market.hourLocal') }}</div>
        <div class="usage-meta text-sm leading-[1.5] text-secondary">
          {{ t('market.localTracked', { used: model.hour.used, limit: model.hour.limit, remaining: model.hour.remaining }) }}
        </div>
        <progress class="h-[10px] w-full accent-accent" max="1" :value="model.hour.ratio"></progress>
      </div>
      <div :class="usageCardClass">
        <div class="usage-title text-sm font-semibold text-primary">{{ t('market.dayLocal') }}</div>
        <div class="usage-meta text-sm leading-[1.5] text-secondary">
          {{ t('market.localTracked', { used: model.day.used, limit: model.day.limit, remaining: model.day.remaining }) }}
        </div>
        <progress class="h-[10px] w-full accent-accent" max="1" :value="model.day.ratio"></progress>
      </div>
      <div :class="usageCardClass">
        <div class="usage-title text-sm font-semibold text-primary">{{ t('market.monthBandwidthLocal') }}</div>
        <div class="usage-meta text-sm leading-[1.5] text-secondary">
          {{ t('market.localTracked', { used: model.month.usedText, limit: model.month.limitText, remaining: model.month.remainingText }) }}
        </div>
        <progress class="h-[10px] w-full accent-accent" max="1" :value="model.month.ratio"></progress>
      </div>
    </div>
  </template>
</template>
