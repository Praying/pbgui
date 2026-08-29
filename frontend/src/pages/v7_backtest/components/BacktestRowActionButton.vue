<script setup lang="ts">
import type { Component } from 'vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';

type BacktestActionTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const props = withDefaults(
  defineProps<{
    icon?: Component;
    label: string;
    tone?: BacktestActionTone;
    pressed?: boolean;
    disabled?: boolean;
  }>(),
  {
    icon: undefined,
    tone: 'neutral',
    pressed: undefined,
    disabled: false,
  }
);

const toneClasses: Record<BacktestActionTone, string> = {
  neutral: 'border-border-default bg-elevated text-secondary hover:border-accent/45 hover:bg-accent/10 hover:text-accent-soft',
  accent: 'border-accent/35 bg-accent/12 text-accent-soft hover:border-accent/65 hover:bg-accent/20',
  success: 'border-success/35 bg-success/12 text-success-soft hover:border-success/65 hover:bg-success/20',
  warning: 'border-warning/35 bg-warning/12 text-warning-soft hover:border-warning/65 hover:bg-warning/20',
  danger: 'border-danger/35 bg-danger/12 text-danger-soft hover:border-danger/65 hover:bg-danger/20 hover:text-danger-soft',
};
</script>

<template>
  <Button
    type="button"
    variant="default"
    size="icon"
    class="backtest-row-action size-7 shrink-0 rounded-md shadow-none"
    :class="[toneClasses[props.tone], props.pressed ? 'active border-accent/65 bg-accent/22 text-accent-soft ring-1 ring-accent/18' : '']"
    :title="props.label"
    :aria-label="props.label"
    :aria-pressed="props.pressed"
    :disabled="props.disabled"
  >
    <PbIcon v-if="props.icon" :icon="props.icon" :size="17" />
    <slot v-else />
  </Button>
</template>
