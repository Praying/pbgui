<script setup lang="ts">
import { PhCaretDown } from '@phosphor-icons/vue';
import { SelectScrollDownButton as SelectScrollDownButtonPrimitive } from 'reka-ui';

/** Scroll button shown while the listbox overflows — pure pass-through chrome. */
</script>

<template>
  <SelectScrollDownButtonPrimitive
    data-slot="select-scroll-down-button"
    class="flex cursor-default items-center justify-center py-1 text-secondary"
  >
    <PhCaretDown class="size-3.5" aria-hidden="true" />
  </SelectScrollDownButtonPrimitive>
</template>
