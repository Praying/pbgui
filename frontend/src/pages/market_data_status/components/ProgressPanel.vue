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

const barScale = computed(() => {
  const s = props.status;
  if (!s || !s.running) return 0;
  if (s.coins_total > 0) return Math.round((s.coins_done / s.coins_total) * 100) / 100;
  return 1;
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
      <div class="mds-progress-bar" :style="{ transform: `scaleX(${barScale})` }"></div>
      <span class="mds-progress-label">{{ label }}</span>
    </div>
    <div class="mds-progress-text">{{ details }}</div>
  </div>
</template>

<style scoped>
/* Ported from .mds-root .mds-progress-* (market_data_status.html:113-157). */
.mds-progress-section {
  margin-bottom: var(--sp-md);
  padding: var(--sp-md);
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-panel);
}

.mds-progress-bar-container {
  position: relative;
  width: 100%;
  height: 20px;
  background: rgb(var(--text-secondary-rgb) / 0.16);
  border-radius: var(--radius-xl);
  overflow: hidden;
  margin-bottom: var(--sp-xs);
}

.mds-progress-bar {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--success));
  transform-origin: left center;
  transition: transform var(--motion-slow) var(--ease-standard);
  border-radius: var(--radius-xl);
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
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  text-shadow: 0 0 4px rgb(0 0 0 / 0.7);
  pointer-events: none;
}

.mds-progress-text {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
</style>
