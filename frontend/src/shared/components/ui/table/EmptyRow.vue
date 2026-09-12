<script setup lang="ts">
import type { Component } from 'vue';
import EmptyState from '@/shared/components/EmptyState.vue';

/**
 * EmptyRow — the single empty-state row spanning the full column set.
 * The colspan is the only per-page fact (column counts vary with the
 * PBv7/PBv8 mode); everything else — the shared EmptyState panel, the
 * centered padding, the frame-finish rule from the list contract —
 * lives here. Render it as the last row of the tbody.
 *
 * `size="inline"` is the compact form used by workbench lists: the cell and
 * the panel shrink together so the placeholder reads as part of the table.
 */
interface Props {
  /** Number of columns the empty message must span. */
  colspan: number | string;
  title: string;
  message?: string;
  actionLabel?: string;
  /** Decorative Phosphor icon rendered by the shared EmptyState. */
  icon?: Component;
  size?: 'panel' | 'inline';
  actionVariant?: 'primary' | 'secondary' | 'info' | 'ghost';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'panel',
  actionVariant: 'secondary',
});

const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <tr data-slot="empty-row">
    <td
      :colspan="props.colspan"
      :class="props.size === 'inline' ? 'p-4! text-center' : 'p-8! text-center'"
    >
      <EmptyState
        :title="props.title"
        :message="props.message"
        :action-label="props.actionLabel"
        :action-variant="props.actionVariant"
        :icon="props.icon"
        :size="props.size"
        @action="emit('action')"
      />
    </td>
  </tr>
</template>
