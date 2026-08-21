<script setup lang="ts">
/* The teal "← Back" header button every panel uses (e.g. :712, :832, :872). */
const emit = defineEmits<{ (e: 'back'): void }>();
</script>

<template>
  <button
    class="back-btn"
    style="width:auto; flex-shrink:0; padding:6px 14px; border-radius:5px; border:1px solid var(--accent); background:transparent; color:var(--accent); font-size:var(--fs-sm); cursor:pointer; font-weight:600;"
    @click="emit('back')"
  >
    &#8592; <slot>Back</slot>
  </button>
</template>
