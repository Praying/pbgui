<script setup lang="ts">
import { computed } from 'vue';
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
</script>

<template>
  <section
    class="pbgui-status-strip"
    :class="`pbgui-status-strip--${props.tone}`"
    :data-tone="props.tone"
    role="status"
    aria-live="polite"
  >
    <span class="pbgui-status-strip__indicator" aria-hidden="true" />
    <span class="pbgui-status-strip__label">{{ props.label }}</span>
    <strong class="pbgui-status-strip__value">{{ props.value }}</strong>
    <span class="pbgui-status-strip__tone-label">{{ toneLabel }}</span>
    <span v-if="props.updatedAt" class="pbgui-status-strip__updated">
      {{ props.updatedAt }}
    </span>
  </section>
</template>
