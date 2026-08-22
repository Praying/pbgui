<script setup lang="ts">
import { useId } from 'vue';
interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
}

const props = defineProps<EmptyStateProps>();

const emit = defineEmits<{
  action: [];
}>();

const stateId = useId();
const titleId = `${stateId}-title`;
const messageId = `${stateId}-message`;
</script>

<template>
  <section
    class="pbgui-empty-state"
    data-state="empty"
    role="status"
    aria-live="polite"
    :aria-labelledby="titleId"
    :aria-describedby="props.message ? messageId : undefined"
  >
    <h2 :id="titleId" class="pbgui-empty-state__title">{{ props.title }}</h2>
    <p v-if="props.message" :id="messageId" class="pbgui-empty-state__message">
      {{ props.message }}
    </p>
    <div v-if="props.actionLabel" class="pbgui-empty-state__actions">
      <button
        type="button"
        class="pbgui-btn btn-secondary"
        @click="emit('action')"
      >
        {{ props.actionLabel }}
      </button>
    </div>
  </section>
</template>
