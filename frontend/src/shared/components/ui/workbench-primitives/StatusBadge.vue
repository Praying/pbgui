<script setup lang="ts">
/**
 * StatusBadge — passive row/card status. System connection state should use
 * StatusStrip instead; this component intentionally stays compact.
 */
type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
}

const props = withDefaults(defineProps<StatusBadgeProps>(), {
  tone: 'neutral',
});
</script>

<template>
  <span
    role="status"
    class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold"
    :class="`status-badge--${props.tone}`"
    :data-tone="props.tone"
  >
    <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
    {{ props.label }}
  </span>
</template>
