<script setup lang="ts">
// Migration watermark: marks pages migrated to Vue 3 during the rollout.
// Visibility is a BUILD-TIME flag — `VITE_MIGRATION_WATERMARK=off npm run build`
// removes the watermark from the bundle entirely. Once all pages are migrated,
// flip the default in vite.config.ts (or delete the component) and rebuild.
const visible = import.meta.env.VITE_MIGRATION_WATERMARK !== 'off';
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
  color: #ffffff;
  opacity: 0.06;
  transform: rotate(-30deg);
  white-space: nowrap;
  user-select: none;
}
</style>
