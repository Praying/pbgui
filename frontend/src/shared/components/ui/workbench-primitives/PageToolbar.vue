<script setup lang="ts">
/**
 * PageToolbar — the canonical contextual action strip for workbench pages.
 * Navigation remains in the rail; this component owns filters and actions.
 */
interface PageToolbarProps {
  label: string;
}

const props = defineProps<PageToolbarProps>();
</script>

<template>
  <div
    role="toolbar"
    class="page-toolbar sticky top-0 z-[1] flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-panel px-3 py-2"
    :aria-label="props.label"
  >
    <div v-if="$slots.context" class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <slot name="context" />
    </div>
    <div class="flex flex-wrap items-center justify-end gap-2">
      <slot />
    </div>
  </div>
</template>
