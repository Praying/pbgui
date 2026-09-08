<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/shared/lib/utils';

/**
 * ListFooter — the terminal bar of a framed list (pbgui-list-footer):
 * the count mirror of the toolbar that opens the table, closing the
 * frame's bottom edge. Static by contract; the toolbar counts already
 * announce changes, so nothing here is aria-live.
 */
interface Props {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();
</script>

<template>
  <footer
    data-slot="list-footer"
    :class="cn('pbgui-list-footer', props.class)"
  >
    <slot />
  </footer>
</template>
