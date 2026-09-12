<script setup lang="ts">
import { computed, useId } from 'vue';
import type { Component } from 'vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';

/**
 * EmptyState — the single empty/no-content surface of the workbench. Every
 * list, panel, and sub-table that can render zero rows uses this component so
 * the dashed placeholder reads identically across PBv7 and PBv8:
 * icon tile, title, one-line explanation, and one primary action.
 */
interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  /** Decorative Phosphor icon rendered in the tile above the title. */
  icon?: Component;
  /** panel = framed placeholder standing in for a whole list; inline = the
      compact variant for table rows and sub-tables. */
  size?: 'panel' | 'inline';
  /** CTA tone; 'primary' for a first-run empty page, 'secondary' otherwise. */
  actionVariant?: 'primary' | 'secondary' | 'info' | 'ghost';
}

const props = withDefaults(defineProps<EmptyStateProps>(), {
  size: 'panel',
  actionVariant: 'secondary',
});

const emit = defineEmits<{
  action: [];
}>();

const stateId = useId();
const titleId = `${stateId}-title`;
const messageId = `${stateId}-message`;
const iconSize = computed(() => (props.size === 'inline' ? 20 : 24));
</script>

<template>
  <section
    class="pbgui-empty-state"
    :class="`pbgui-empty-state--${props.size}`"
    data-state="empty"
    role="status"
    aria-live="polite"
    :aria-labelledby="titleId"
    :aria-describedby="props.message ? messageId : undefined"
  >
    <span v-if="props.icon" class="pbgui-empty-state__icon" aria-hidden="true">
      <PbIcon :icon="props.icon" :size="iconSize" />
    </span>
    <h2 :id="titleId" class="pbgui-empty-state__title">{{ props.title }}</h2>
    <p v-if="props.message" :id="messageId" class="pbgui-empty-state__message">
      {{ props.message }}
    </p>
    <div v-if="props.actionLabel" class="pbgui-empty-state__actions">
      <Button
        type="button"
        :variant="props.actionVariant"
        @click="emit('action')"
      >
        {{ props.actionLabel }}
      </Button>
    </div>
  </section>
</template>
