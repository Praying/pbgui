<script setup lang="ts">
import { ref } from 'vue';
import { PhCaretRight } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';

/** The .expander primitive (:672-676 / :1127-1140) — click header toggles. */
defineProps<{ id: string; title: string }>();
const open = ref(false);
function toggle(): void {
  open.value = !open.value;
}
</script>

<template>
  <div :id="id" class="expander" :class="{ open }">
    <!-- ui-migration: blocked — accordion panel header (out-of-scope panel
         structure); its chrome is the page-global .expander-header rule the
         shared CoinOverridesPanel expanders also render. -->
    <button type="button" class="expander-header" :aria-expanded="open" @click="toggle">
      <PbIcon class="arrow" :icon="PhCaretRight" :size="14" />
      <span>{{ title }}</span>
      <slot name="header-extra"></slot>
    </button>
    <!-- Body stays in the DOM, hidden by CSS — legacy .expander-body parity
         (fields remain addressable like the run-version-hidden fields). -->
    <div class="expander-body">
      <slot></slot>
    </div>
  </div>
</template>
