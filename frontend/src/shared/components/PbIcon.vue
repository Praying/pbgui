<script setup lang="ts">
import { computed, markRaw, toRaw } from 'vue';
import type { Component } from 'vue';

export type PbIconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

interface PbIconProps {
  icon: Component;
  size?: number | string;
  weight?: PbIconWeight;
  mirrored?: boolean;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<PbIconProps>(), {
  size: 16,
  weight: 'regular',
  mirrored: false,
});

const iconComponent = computed(() => markRaw(toRaw(props.icon)));
</script>

<template>
  <component
    :is="iconComponent"
    :size="props.size"
    :weight="props.weight"
    :mirrored="props.mirrored"
    :aria-label="props.ariaLabel"
    :aria-hidden="props.ariaLabel ? undefined : 'true'"
  />
</template>
