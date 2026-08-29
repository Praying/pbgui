<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  type SliderRootProps,
} from 'reka-ui';
import { cn } from '@/shared/lib/utils';

/**
 * Slider — single-value range control (PBGui's param tuning and weight
 * sliders are all single-thumb). Reka's SliderRoot models an array of
 * thumbs; this component adapts a plain number so pages can bind it
 * directly to a numeric field.
 *
 * Keyboard support (arrows / home / end / page steps) comes from Reka.
 */
interface Props extends Pick<SliderRootProps, 'min' | 'max' | 'step' | 'disabled' | 'inverted' | 'name'> {
  /** Accessible name for the thumb control (read by screen readers). */
  label: string;
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();

const model = defineModel<number>();

const thumbValues = computed<number[] | undefined>({
  get: () => (model.value === undefined || model.value === null ? undefined : [model.value]),
  set: (value) => {
    if (value && value.length > 0) model.value = value[0];
  },
});
</script>

<template>
  <SliderRoot
    v-model="thumbValues"
    data-slot="slider"
    :min="props.min ?? 0"
    :max="props.max ?? 100"
    :step="props.step ?? 1"
    :disabled="props.disabled"
    :inverted="props.inverted"
    :name="props.name"
    :class="cn(
      'relative flex w-full touch-none select-none items-center disabled:pointer-events-none disabled:opacity-45',
      props.class,
    )"
  >
    <SliderTrack
      data-slot="slider-track"
      class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary/16"
    >
      <SliderRange data-slot="slider-range" class="absolute h-full bg-accent" />
    </SliderTrack>
    <SliderThumb
      data-slot="slider-thumb"
      :aria-label="props.label"
      class="block size-4 cursor-pointer rounded-full border-2 border-accent bg-elevated shadow-[0_1px_3px_rgb(0_0_0_/_0.6)] outline-none transition-[border-color,transform] duration-[120ms] ease-standard hover:border-accent-soft focus-visible:border-accent-soft focus-visible:outline-2 focus-visible:outline-accent-soft focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45"
    />
  </SliderRoot>
</template>
