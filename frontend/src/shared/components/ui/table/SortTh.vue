<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { PhCaretDown, PhCaretUp } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { cn } from '@/shared/lib/utils';
import type { SortDirection } from '.';

/**
 * SortTh — the sortable list-table header cell. Owns the interaction
 * every PBv7/PBv8 panel used to hand-roll: the caret indicator, hover
 * affordance, aria-sort, keyboard activation (Enter/Space), and the
 * click emit. Sort state stays in the caller: feed the column's live
 * direction through `sort` (undefined = this column is not the active
 * sort) and echo the sortKey back from the sort handler.
 */
interface Props {
  /** Sort key emitted on activation (also the data-sort hook). */
  sortKey: string;
  /** Plain text label; use the slot for rich headers (data-tip, …). */
  label?: string;
  /** Active direction for this column; undefined when not sorted by it. */
  sort?: SortDirection;
  align?: 'left' | 'center' | 'right';
  sticky?: boolean;
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  sort: undefined,
  align: 'left',
  sticky: true,
});

const emit = defineEmits<{ sort: [key: string] }>();

const alignClass = computed(() => {
  if (props.align === 'center') return 'text-center';
  if (props.align === 'right') return 'text-right';
  return '';
});

function activate(): void {
  emit('sort', props.sortKey);
}
</script>

<template>
  <th
    data-slot="sort-th"
    :class="cn(
      'cursor-pointer select-none transition-colors hover:text-primary',
      props.sticky && 'sticky top-0 z-[2]',
      alignClass,
      props.class,
    )"
    :data-sort="sortKey"
    role="button"
    tabindex="0"
    :aria-sort="sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined"
    @click="activate"
    @keydown.enter.prevent="activate"
    @keydown.space.prevent="activate"
  >
    <span class="inline-flex items-center gap-1">
      <slot>{{ label }}</slot>
      <PbIcon
        v-if="sort"
        :icon="sort === 'asc' ? PhCaretUp : PhCaretDown"
        :size="12"
        class="text-accent-soft"
      />
    </span>
  </th>
</template>
