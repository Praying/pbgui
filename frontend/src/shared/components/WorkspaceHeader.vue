<script setup lang="ts">
import { useSlots } from 'vue';

interface WorkspaceHeaderProps {
  family?: string;
  title: string;
  description?: string;
}

const props = defineProps<WorkspaceHeaderProps>();
const slots = useSlots();
</script>

<template>
  <header class="workspace-header">
    <div class="workspace-header__identity">
      <p v-if="props.family" class="workspace-header__family">{{ props.family }}</p>
      <h1 class="workspace-header__title">{{ props.title }}</h1>
      <p v-if="props.description" class="workspace-header__description">
        {{ props.description }}
      </p>
    </div>

    <div v-if="slots.status || slots.actions" class="workspace-header__utilities">
      <div v-if="slots.status" class="workspace-header__status">
        <slot name="status" />
      </div>
      <div v-if="slots.actions" class="workspace-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
