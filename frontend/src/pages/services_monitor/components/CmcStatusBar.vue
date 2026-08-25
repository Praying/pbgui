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
import { Button } from '@/shared/components/ui/button';
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
    <Button class="cmc-refresh-btn text-current opacity-70 hover:bg-transparent hover:text-current hover:opacity-100" variant="ghost" size="icon" type="button" :title="t('common.refresh')" :aria-label="t('common.refresh')" @click="emit('refresh')"><PbIcon :icon="PhArrowClockwise" /></Button>
    <span class="cmc-status-text" id="cmc-status-text">{{ statusText }}</span>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html. -->
<style scoped>
.cmc-status-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin: 0.5rem 1rem 0; padding: 0.55rem 0.9rem; border-radius: 8px; font-size: var(--fs-sm);
  border: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--success-deep) 28%, var(--bg-card)); color: var(--success); min-height: 2.2rem;
  flex-shrink: 0;
}
.cmc-status-bar.error { background: color-mix(in srgb, var(--danger-deep) 28%, var(--bg-card)); border-color: var(--danger-deep); color: var(--danger-soft); }
.cmc-status-bar.loading { background: var(--bg-page); color: var(--text-disabled); }
.cmc-status-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
