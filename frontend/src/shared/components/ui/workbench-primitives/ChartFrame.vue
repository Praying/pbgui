<script setup lang="ts">
/**
 * ChartFrame — shared framing for chart engines. Rendering remains owned by
 * the caller while loading, empty, and error states can use the same region.
 */
type ChartState = 'ready' | 'loading' | 'empty' | 'error';

interface ChartFrameProps {
  title: string;
  state?: ChartState;
  description?: string;
}

const props = withDefaults(defineProps<ChartFrameProps>(), {
  state: 'ready',
});
</script>

<template>
  <section
    class="flex min-h-0 flex-col rounded-lg border border-border-default bg-panel p-4"
    :data-chart-frame="props.state"
    :aria-label="props.title"
  >
    <header class="mb-3 flex shrink-0 items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="m-0 truncate text-md font-semibold text-primary">{{ props.title }}</h3>
        <p v-if="props.description" class="mt-1 text-sm text-muted">{{ props.description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div class="min-h-0 flex-1">
      <slot />
    </div>
  </section>
</template>
