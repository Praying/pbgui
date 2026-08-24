<script setup lang="ts">
import { PhCaretUp } from '@phosphor-icons/vue';
import { SelectScrollUpButton as SelectScrollUpButtonPrimitive } from 'reka-ui';

/** Scroll button shown while the listbox overflows — pure pass-through chrome. */
</script>

<template>
  <SelectScrollUpButtonPrimitive
    data-slot="select-scroll-up-button"
    class="flex cursor-default items-center justify-center py-1 text-secondary"
  >
    <PhCaretUp class="size-3.5" aria-hidden="true" />
  </SelectScrollUpButtonPrimitive>
</template>
