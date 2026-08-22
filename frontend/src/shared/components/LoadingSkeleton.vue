<script setup lang="ts">
import { computed, useId } from 'vue';

interface LoadingSkeletonProps {
  label: string;
  lines?: number;
}

const props = withDefaults(defineProps<LoadingSkeletonProps>(), {
  lines: 3,
});

const lineCount = computed(() => Math.max(1, Math.trunc(props.lines)));
const stateId = useId();
const labelId = `${stateId}-label`;
</script>

<template>
  <section
    class="pbgui-loading-skeleton"
    data-state="loading"
    aria-busy="true"
    role="status"
    aria-live="polite"
    :aria-labelledby="labelId"
  >
    <p :id="labelId" class="pbgui-loading-skeleton__label">{{ props.label }}</p>
    <div class="pbgui-loading-skeleton__blocks" aria-hidden="true">
      <span
        v-for="lineNumber in lineCount"
        :key="lineNumber"
        class="pbgui-skeleton pbgui-skeleton-line"
      />
    </div>
  </section>
</template>
