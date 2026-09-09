<script setup lang="ts">
/**
 * ActionGroup — a compact semantic grouping for related controls. Priority
 * is exposed as data so page toolbars can style or audit action order without
 * coupling the group to a specific button implementation.
 */
interface ActionGroupProps {
  label: string;
  priority?: 'context' | 'primary' | 'secondary' | 'danger' | 'overflow';
}

const props = withDefaults(defineProps<ActionGroupProps>(), {
  priority: 'secondary',
});
</script>

<template>
  <div
    role="group"
    class="flex flex-wrap items-center gap-2"
    :aria-label="props.label"
    :data-action-priority="props.priority"
  >
    <slot />
  </div>
</template>
