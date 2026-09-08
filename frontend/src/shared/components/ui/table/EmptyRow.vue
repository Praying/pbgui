<script setup lang="ts">
import EmptyState from '@/shared/components/EmptyState.vue';

/**
 * EmptyRow — the single empty-state row spanning the full column set.
 * The colspan is the only per-page fact (column counts vary with the
 * PBv7/PBv8 mode); everything else — the shared EmptyState panel, the
 * centered padding, the frame-finish rule from the list contract —
 * lives here. Render it as the last row of the tbody.
 */
interface Props {
  /** Number of columns the empty message must span. */
  colspan: number | string;
  title: string;
  message?: string;
  actionLabel?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <tr data-slot="empty-row">
    <td :colspan="colspan" class="p-8! text-center">
      <EmptyState
        :title="title"
        :message="message"
        :action-label="actionLabel"
        @action="emit('action')"
      />
    </td>
  </tr>
</template>
