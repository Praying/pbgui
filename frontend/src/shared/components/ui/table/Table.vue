<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/shared/lib/utils';

/**
 * Table — the workbench list-table shell on the shared pbgui-list-table
 * contract (components.css). Collapses the class string every PBv7/PBv8
 * panel used to repeat (`pbgui-list-table w-full border-separate
 * border-spacing-0 text-sm`); width floors (min-w-*) stay caller-owned
 * and merge through `class`.
 */
interface Props {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();
</script>

<template>
  <table
    data-slot="table"
    :class="cn('pbgui-list-table w-full border-separate border-spacing-0 text-sm', props.class)"
  >
    <slot />
  </table>
</template>
