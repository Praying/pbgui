<script setup lang="ts">
/**
 * PanelHeader — the shared identity row for cards, panels, and workbench
 * sections. Optional supporting copy and actions keep dense panels aligned.
 */
interface PanelHeaderProps {
  title: string;
  description?: string;
  headingLevel?: 'h2' | 'h3' | 'h4';
}

const props = withDefaults(defineProps<PanelHeaderProps>(), {
  headingLevel: 'h2',
});
</script>

<template>
  <header class="flex min-w-0 items-start justify-between gap-3 border-b border-border-subtle pb-3">
    <div class="min-w-0">
      <component
        :is="props.headingLevel"
        class="m-0 truncate text-md font-semibold tracking-tight text-primary"
      >
        {{ props.title }}
      </component>
      <p v-if="props.description" class="mt-1 max-w-[68ch] text-sm leading-snug text-muted">
        {{ props.description }}
      </p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
