<script setup lang="ts">
// Migration watermark: marks pages migrated to Vue 3 during the rollout.
// Visibility is a BUILD-TIME flag. It is disabled by default across every Vue
// page; use `VITE_MIGRATION_WATERMARK=on npm run build` only for migration QA.
const visible = import.meta.env.VITE_MIGRATION_WATERMARK === 'on';
</script>

<template>
  <div
    v-if="visible"
    class="migration-watermark"
    style="pointer-events: none; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 9999; overflow: hidden;"
    aria-hidden="true"
  >
    <span class="migration-watermark-text">VUE MIGRATION PREVIEW</span>
  </div>
</template>

<style scoped>
.migration-watermark-text {
  font-size: 9vw;
  font-weight: 700;
  letter-spacing: 0.35em;
  color: #f2f5fb;
  opacity: 0.06;
  transform: rotate(-30deg);
  white-space: nowrap;
  user-select: none;
}
</style>
