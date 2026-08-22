<script setup lang="ts">
import { PhArrowClockwise, PhArrowLeft } from '@phosphor-icons/vue';
import { useId } from 'vue';
import PbIcon from './PbIcon.vue';
interface ErrorStateProps {
  title: string;
  message: string;
  retryLabel?: string;
  backLabel?: string;
}

const props = defineProps<ErrorStateProps>();

const emit = defineEmits<{
  retry: [];
  back: [];
}>();

const stateId = useId();
const titleId = `${stateId}-title`;
const messageId = `${stateId}-message`;
</script>

<template>
  <section
    class="pbgui-error-state"
    data-state="error"
    role="alert"
    aria-live="assertive"
    :aria-labelledby="titleId"
    :aria-describedby="messageId"
  >
    <h2 :id="titleId" class="pbgui-error-state__title">{{ props.title }}</h2>
    <p :id="messageId" class="pbgui-error-state__message">{{ props.message }}</p>
    <div v-if="props.retryLabel || props.backLabel" class="pbgui-error-state__actions">
      <button
        v-if="props.retryLabel"
        type="button"
        class="pbgui-btn btn-danger"
        @click="emit('retry')"
      >
        <PbIcon :icon="PhArrowClockwise" :size="16" />
        {{ props.retryLabel }}
      </button>
      <button
        v-if="props.backLabel"
        type="button"
        class="pbgui-btn btn-secondary"
        @click="emit('back')"
      >
        <PbIcon :icon="PhArrowLeft" :size="16" />
        {{ props.backLabel }}
      </button>
    </div>
  </section>
</template>
