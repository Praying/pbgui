<script setup lang="ts">
import { useId } from 'vue';
import type { Component } from 'vue';
import PbIcon from './PbIcon.vue';

interface IconButtonProps {
  icon: Component;
  label: string;
  size?: number | string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const props = withDefaults(defineProps<IconButtonProps>(), {
  size: 16,
  disabled: false,
  type: 'button',
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

const tooltipId = useId();
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled"
    :aria-label="props.label"
    :aria-describedby="$slots.tooltip ? tooltipId : undefined"
    :title="$slots.tooltip ? undefined : props.label"
    @click="emit('click', $event)"
  >
    <PbIcon :icon="props.icon" :size="props.size" />
    <span v-if="$slots.tooltip" :id="tooltipId" class="icon-button__tooltip" role="tooltip">
      <slot name="tooltip" />
    </span>
  </button>
</template>
