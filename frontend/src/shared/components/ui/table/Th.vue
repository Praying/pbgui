<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { cn } from '@/shared/lib/utils';

/**
 * Th — a static list-table header cell (no sort interaction). Sticky by
 * default so the header rides along inside a ListWrap scroll frame; pass
 * `:sticky="false"` for document-flow tables (strategy explorer orders)
 * where a sticky header would float against the page viewport instead.
 */
interface Props {
  class?: HTMLAttributes['class'];
  align?: 'left' | 'center' | 'right';
  sticky?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  align: 'left',
  sticky: true,
});

const alignClass = computed(() => {
  if (props.align === 'center') return 'text-center';
  if (props.align === 'right') return 'text-right';
  return '';
});
</script>

<template>
  <th
    data-slot="th"
    :class="cn(props.sticky && 'sticky top-0 z-[2]', alignClass, props.class)"
  >
    <slot />
  </th>
</template>
