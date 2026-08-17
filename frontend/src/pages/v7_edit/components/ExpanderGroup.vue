<script setup lang="ts">
import { ref } from 'vue';

/** The .expander primitive (:672-676 / :1127-1140) — click header toggles. */
defineProps<{ id: string; title: string }>();
const open = ref(false);
function toggle(): void {
  open.value = !open.value;
}
</script>

<template>
  <div :id="id" class="expander" :class="{ open }">
    <div class="expander-header" @click="toggle">
      <span class="arrow">&#x25B6;</span> <span>{{ title }}</span>
      <slot name="header-extra"></slot>
    </div>
    <!-- Body stays in the DOM, hidden by CSS — legacy .expander-body parity
         (fields remain addressable like the run-version-hidden fields). -->
    <div class="expander-body">
      <slot></slot>
    </div>
  </div>
</template>
