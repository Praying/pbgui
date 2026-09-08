<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { ref } from 'vue';
import { cn } from '@/shared/lib/utils';

/**
 * ListWrap — the scroll frame around a workbench list table, carrying the
 * shared pbgui-list-wrap contract (deep surface, thin scrollbars). Deliberately
 * thin: layout utilities (min-h-0 / flex-1 / overflow-auto / framed borders)
 * stay caller-owned because the PBv7/PBv8 panels frame their tables
 * differently (bare wrap, opt-table-frame, pbgui-config-frame). Exposes its
 * root element for drag-select composables that need the scrolling container:
 * `const wrap = ref<typeof ListWrap | null>(null)` then
 * `getWrap: () => wrap.value?.root ?? null`.
 */
interface Props {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();

const root = ref<HTMLElement | null>(null);

defineExpose({ root });
</script>

<template>
  <div
    ref="root"
    data-slot="list-wrap"
    :class="cn('pbgui-list-wrap', props.class)"
  >
    <slot />
  </div>
</template>
