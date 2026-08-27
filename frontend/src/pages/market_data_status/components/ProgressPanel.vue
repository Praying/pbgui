<script setup lang="ts">
/*
 * Run progress (legacy mds-progress-section, market_data_status.html:283-291
 * and updateUI progress branches :456-469):
 *   running && coins_total > 0 → bar = round(done/total * 100)%,
 *                               label "done / total",
 *                               details "Current: {coin|...}"
 *   running (no total)         → bar 100%, "Running...", "Starting..."
 *   otherwise                  → section hidden (legacy display:none)
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MarketDataStatus } from '../types';

const props = defineProps<{ status: MarketDataStatus | null }>();

const { t } = useI18n();

const running = computed(() => props.status?.running === true);

const barWidth = computed(() => {
  const s = props.status;
  if (!s || !s.running) return '0%';
  if (s.coins_total > 0) return `${Math.round((s.coins_done / s.coins_total) * 100)}%`;
  return '100%';
});

const label = computed(() => {
  const s = props.status;
  if (!s || !s.running) return '0 / 0';
  if (s.coins_total > 0) return `${s.coins_done} / ${s.coins_total}`;
  return t('misc.mds.running');
});

const details = computed(() => {
  const s = props.status;
  if (!s || !s.running) return t('misc.mds.idle');
  if (s.coins_total > 0) return t('misc.mds.current', { coin: s.current_coin || '...' });
  return t('misc.mds.starting');
});
</script>

<template>
  <div class="mds-progress-section" v-show="running">
    <div class="mds-progress-bar-container">
      <div class="mds-progress-bar" :style="{ width: barWidth }"></div>
      <span class="mds-progress-label">{{ label }}</span>
    </div>
    <div class="mds-progress-text">{{ details }}</div>
  </div>
</template>

<style scoped>
/* Ported from .mds-root .mds-progress-* (market_data_status.html:113-157). */
.mds-progress-section {
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  background: var(--mds-bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--mds-border-color);
  box-shadow: var(--shadow-panel);
}

.mds-progress-bar-container {
  position: relative;
  width: 100%;
  height: 20px;
  background: var(--mds-bg-tertiary);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 0.4rem;
}

.mds-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--mds-accent-info), var(--mds-accent-success));
  transition: width 0.3s var(--ease-standard);
  border-radius: 10px;
}

.mds-progress-label {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--mds-text-primary);
  text-shadow: 0 0 4px rgba(5, 8, 14, 0.8);
  pointer-events: none;
}

.mds-progress-text {
  font-size: var(--fs-sm);
  color: var(--mds-text-secondary);
}
</style>
