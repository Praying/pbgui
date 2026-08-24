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

<style scoped>
/* Ported from styles/editor.css (deleted at the Tailwind migration).
   The status classes stay CSS — the tests pin the element's class list
   to exactly ['status', cls], so no utility may ride along; the tone
   variants are the legacy .status.saved/.status.error rules. */
.status {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  align-self: flex-end;
  padding-bottom: 0.15rem;
}
.status.saved {
  color: var(--success-soft);
}
.status.error {
  color: var(--danger-soft);
}
</style>
