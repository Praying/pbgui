<script setup lang="ts">
/*
 * Action buttons (legacy mds-controls, market_data_status.html:271-281 and
 * updateUI button matrix :439-448). Legacy ships every button disabled
 * (html:272-280) and only updateUI — i.e. the first WS status frame —
 * re-enables them, hence the `received` prop (true after the first frame):
 *   Refresh Now  visible ⇔ !queued   (disabled ⇔ queued || !received)
 *   Cancel       visible ⇔ queued    (disabled ⇔ !queued)
 *   Stop         visible ⇔ running   (disabled ⇔ !running)
 * v-show keeps the legacy display:none toggling (flex children render
 * identically to the legacy display:block).
 */
import { useI18n } from 'vue-i18n';

defineProps<{ queued: boolean; running: boolean; received: boolean }>();
defineEmits<{ refresh: []; cancel: []; stop: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="mds-controls">
    <button class="mds-btn primary" type="button" v-show="!queued" :disabled="queued || !received" @click="$emit('refresh')">
      &#9193; <span>{{ t('misc.mds.refreshNow') }}</span>
    </button>
    <button class="mds-btn danger" type="button" v-show="queued" :disabled="!queued" @click="$emit('cancel')">
      &#9209; <span>{{ t('misc.mds.cancelQueuedRefresh') }}</span>
    </button>
    <button class="mds-btn danger" type="button" v-show="running" :disabled="!running" @click="$emit('stop')">
      &#9209; <span>{{ t('misc.mds.stopCurrentRun') }}</span>
    </button>
  </div>
</template>

<style scoped>
/* Ported from .mds-root .mds-controls / .mds-btn (market_data_status.html:62-111). */
.mds-controls {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.mds-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--fs-sm);
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
}

.mds-btn.primary {
  background: var(--mds-accent-info);
  color: white;
}

.mds-btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

.mds-btn.danger {
  background: var(--mds-accent-danger);
  color: white;
}

.mds-btn.danger:hover:not(:disabled) {
  background: #dc2626;
}

.mds-btn.secondary {
  background: var(--mds-bg-tertiary);
  color: var(--mds-text-primary);
  border: 1px solid var(--mds-border-color);
}

.mds-btn.secondary:hover:not(:disabled) {
  background: var(--mds-bg-secondary);
}

.mds-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
