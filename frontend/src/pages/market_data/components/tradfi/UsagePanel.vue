<script setup lang="ts">
/*
 * Tiingo usage cards — legacy renderTiingoUsage (market_data_main.html
 * :5676-5723). Numeric normalization lives in lib/tiingoUsage.ts.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
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
</script>

<template>
  <div v-if="!configured" class="settings-empty">{{ t('market.tiingoConfigureProfile') }}</div>
  <template v-else>
    <div class="callout" :class="{ warning: model.isExceeded }" style="margin-bottom: var(--sp-md);">
      {{ calloutText }}
    </div>
    <div class="usage-grid">
      <div class="usage-card">
        <div class="usage-title">{{ t('market.hourLocal') }}</div>
        <div class="usage-meta">
          {{ t('market.localTracked', { used: model.hour.used, limit: model.hour.limit, remaining: model.hour.remaining }) }}
        </div>
        <progress max="1" :value="model.hour.ratio"></progress>
      </div>
      <div class="usage-card">
        <div class="usage-title">{{ t('market.dayLocal') }}</div>
        <div class="usage-meta">
          {{ t('market.localTracked', { used: model.day.used, limit: model.day.limit, remaining: model.day.remaining }) }}
        </div>
        <progress max="1" :value="model.day.ratio"></progress>
      </div>
      <div class="usage-card">
        <div class="usage-title">{{ t('market.monthBandwidthLocal') }}</div>
        <div class="usage-meta">
          {{ t('market.localTracked', { used: model.month.usedText, limit: model.month.limitText, remaining: model.month.remainingText }) }}
        </div>
        <progress max="1" :value="model.month.ratio"></progress>
      </div>
    </div>
  </template>
</template>
