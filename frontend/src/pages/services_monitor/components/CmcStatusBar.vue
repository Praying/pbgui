<script setup lang="ts">
/*
 * CMC pool status bar, ported from the legacy frontend/services_monitor.html
 * #cmc-status-bar that sits between the pbcoindata ctrl-strip and the tab bar
 * (visible on every pbcoindata tab, not just the pool tab). The load state
 * comes from App (legacy loadCmcPool / renderCmcPool bar updates).
 */
import { computed } from 'vue';
import { PhArrowClockwise } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { cmcNumber } from '../cmc';
import type { CmcPool } from '../types';

defineOptions({ name: 'CmcStatusBar' });

interface Props {
  /** Latest load phase (legacy bar class swaps in loadCmcPool/renderCmcPool). */
  status: 'loading' | 'ok' | 'error';
  /** serverMsg()-translated error for the unavailable bar text. */
  loadError?: string;
  pool?: CmcPool;
}

const props = withDefaults(defineProps<Props>(), {
  loadError: '',
  pool: () => ({}),
});

const emit = defineEmits<{ refresh: [] }>();

const { t } = useI18n();

const statusBarClass = computed<'loading' | 'error' | ''>(() => {
  if (props.status === 'loading') return 'loading';
  if (props.status === 'error') return 'error';
  return props.pool.ready ? '' : 'error';
});

const statusText = computed(() => {
  if (props.status === 'loading') return t('sysmon.loadingCmcPool');
  if (props.status === 'error') return t('sysmon.cmcPoolUnavailable', { msg: props.loadError || '' });
  if (!props.pool.ready) return 'CMC pool is not configured. Add an active key to enable CMC requests.';
  const maxGeneration = Math.max(0, ...(props.pool.keys ?? []).map((item) => Number(item.generation) || 0));
  return `CMC pool ready: ${props.pool.active_credentials || 0} active, health ${props.pool.health || 'unknown'}, generation ${cmcNumber(maxGeneration)}`;
});
</script>

<template>
  <div class="cmc-status-bar" :class="statusBarClass" id="cmc-status-bar">
    <button class="cmc-refresh-btn" type="button" :title="t('common.refresh')" :aria-label="t('common.refresh')" @click="emit('refresh')"><PbIcon :icon="PhArrowClockwise" /></button>
    <span class="cmc-status-text" id="cmc-status-text">{{ statusText }}</span>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html. -->
<style scoped>
.cmc-status-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin: 0.5rem 1rem 0; padding: 0.55rem 0.9rem; border-radius: 8px; font-size: var(--fs-sm);
  border: 1px solid #1e2736; background: #0d2a1a; color: #4ade80; min-height: 2.2rem;
  flex-shrink: 0;
}
.cmc-status-bar.error { background: #2d1515; border-color: #7f1d1d; color: #fca5a5; }
.cmc-status-bar.loading { background: #131b2b; color: #4a5568; }
.cmc-status-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmc-refresh-btn { background: none; border: none; color: inherit; cursor: pointer; font-size: 1rem; opacity: 0.7; padding: 0 2px; flex-shrink: 0; }
.cmc-refresh-btn:hover { opacity: 1; }
</style>
