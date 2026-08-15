<script setup lang="ts">
/**
 * StatusBadge — the legacy #status element + setStatus (dashboard_editor.html:
 * 469, 541-544): textContent = msg, className = 'status' + optional cls.
 * Purely presentational; App owns the message/class state (doSave statuses
 * and the doSync status mirror both write here, like legacy setStatus).
 */
defineProps<{
  /** Legacy setStatus msg (already translated). */
  msg: string;
  /** Legacy setStatus cls: '' | 'saved' | 'error'. */
  cls: string;
}>();
</script>

<template>
  <div id="status" class="status" :class="cls">{{ msg }}</div>
</template>
