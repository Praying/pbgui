<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

interface StatusStripProps {
  label: string;
  value: string;
  tone?: StatusTone;
  updatedAt?: string;
}

const props = withDefaults(defineProps<StatusStripProps>(), {
  tone: 'neutral',
});

const { t } = useI18n();
const toneLabel = computed(() => t(`shared.statusTone.${props.tone}`));
const statusDetailsId = `pbgui-status-details-${useId()}`;
const statusDetails = computed(() => {
  const details = `${props.label}: ${props.value}`;
  return props.updatedAt ? `${details} (${props.updatedAt})` : details;
});
</script>

<template>
  <section
    class="pbgui-status-strip"
    :class="`pbgui-status-strip--${props.tone}`"
    :data-tone="props.tone"
    role="status"
    aria-live="polite"
    tabindex="0"
    :aria-describedby="statusDetailsId"
    :title="statusDetails"
  >
    <span class="pbgui-status-strip__indicator" aria-hidden="true" />
    <strong class="pbgui-status-strip__value">{{ toneLabel }}</strong>
    <span :id="statusDetailsId" class="pbgui-status-strip__details" role="tooltip">
      {{ statusDetails }}
    </span>
  </section>
</template>
