<script setup lang="ts">
/**
 * Settings modal — renderSettingsModal (:1482-1540), settingsAdjustCpu
 * (:1568-1577), the dirty-guarded syncOpenSettingsModal (:1542-1558)
 * and the save payload (:1587-1619). The clean-now POST runs in App
 * (useSettings.cleanHlcvsNow); the busy visual (:1624) arrives via the
 * `cleaning` prop.
 */
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { effectiveCpuMax } from '../composables/useSettings';
import type { BacktestSettings, SettingsPatch } from '../types';

const props = defineProps<{
  settings: BacktestSettings;
  open: boolean;
  cleaning: boolean;
}>();
const emit = defineEmits<{
  save: [patch: SettingsPatch];
  cleanup: [days: number];
  close: [];
}>();

const { t } = useI18n();

const cpuMax = computed<number>(() =>
  effectiveCpuMax(props.settings, typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency as number | undefined) : undefined)
);

const draft = reactive({
  cpu: 1,
  autostart: false,
  usePbguiMarketData: false,
  cleanupEnabled: false,
  cleanupDays: 7,
  cleanupInterval: 24,
});
const dirty = ref(false);
/**
 * Legacy syncOpenSettingsModal (:1542-1558) runs exactly ONCE per open —
 * from openSettingsModal's loadSettings().then(sync) (:1563). WS settings
 * pushes (:1296-1303) merge into the store but never re-sync an open
 * modal, so a push mid-open leaves the displayed values stale (legacy
 * parity). The first settings change while open models the load refresh.
 */
const syncedOnce = ref(false);

/** syncOpenSettingsModal (:1542-1558) — skip while the user edited. */
function syncFromSettings(): void {
  draft.cpu = Math.max(1, Math.min(Number(props.settings.cpu) || 1, cpuMax.value));
  draft.autostart = !!props.settings.autostart;
  draft.usePbguiMarketData = !!props.settings.use_pbgui_market_data;
  draft.cleanupEnabled = !!props.settings.hlcvs_cleanup_enabled;
  draft.cleanupDays = props.settings.hlcvs_cleanup_days || 7;
  draft.cleanupInterval = props.settings.hlcvs_cleanup_interval_h || 24;
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      dirty.value = false; // openSettingsModal (:1561)
      syncedOnce.value = false;
      syncFromSettings();
    }
  },
  { immediate: true }
);

watch(
  () => props.settings,
  () => {
    if (!props.open || dirty.value || syncedOnce.value) return;
    // legacy sync only runs while cpu_max is valid (:1543-1547)
    const raw = Number(props.settings.cpu_max);
    if (!Number.isFinite(raw) || raw < 1) return;
    syncFromSettings();
    syncedOnce.value = true;
  },
  { deep: true }
);

/** settingsAdjustCpu (:1568-1577): dirty first, no-op before cpu_max loads (:1573). */
function adjustCpu(delta: number): void {
  dirty.value = true; // :1569
  const mx = Number(props.settings.cpu_max);
  if (!Number.isFinite(mx) || mx < 1) return; // :1573 — pre-load no-op
  const value = Number.parseInt(String(draft.cpu), 10) + delta;
  draft.cpu = Math.min(Math.max(value, 1), mx);
}

const cleanupOptsStyle = computed(() =>
  draft.cleanupEnabled ? '' : 'opacity: 0.4; pointer-events: none;'
);

function save(): void {
  emit('save', {
    cpu: Number.parseInt(String(draft.cpu), 10) || 1,
    autostart: draft.autostart,
    use_pbgui_market_data: draft.usePbguiMarketData,
    hlcvs_cleanup_enabled: draft.cleanupEnabled,
    hlcvs_cleanup_days: Number.parseInt(String(draft.cleanupDays), 10) || 7,
    hlcvs_cleanup_interval_h: Number.parseInt(String(draft.cleanupInterval), 10) || 24,
  });
}

function cleanupNow(): void {
  emit('cleanup', Number.parseInt(String(draft.cleanupDays), 10) || 7);
}
</script>

<template>
  <div v-if="open" id="modal-root" class="open">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">{{ t('v7backtest.settingsTitle') }}</span>
        <button type="button" class="modal-close" title="Close" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <div style="display: flex; flex-direction: column; gap: var(--sp-md); min-width: 320px">
          <div class="sb-label">{{ t('v7backtest.settingsCpuSlots') }}</div>
          <div class="sb-stepper">
            <span class="sb-stepper-label">CPU</span>
            <button type="button" data-test="cpu-minus" @click="adjustCpu(-1)">−</button>
            <input id="set-cpu-val" type="text" :value="draft.cpu" readonly />
            <button type="button" data-test="cpu-plus" @click="adjustCpu(1)">+</button>
            <span id="set-cpu-max" style="color: var(--text-dim); font-size: var(--fs-xs); margin-left: var(--sp-sm)">
              {{ t('v7backtest.maxCpu', { n: cpuMax }) }}
            </span>
          </div>
          <label class="sb-toggle">
            <input id="set-autostart" v-model="draft.autostart" type="checkbox" @change="dirty = true" />
            <span>{{ t('v7backtest.autostart') }}</span>
          </label>
          <label class="sb-toggle">
            <input id="set-pbgui-market-data" v-model="draft.usePbguiMarketData" type="checkbox" @change="dirty = true" />
            <span>{{ t('v7backtest.usePbguiMarketData') }}</span>
          </label>
          <hr class="sb-sep" />
          <div class="sb-label">{{ t('v7backtest.hlcvsCacheCleanup') }}</div>
          <label class="sb-toggle">
            <input id="set-cleanup-enabled" v-model="draft.cleanupEnabled" type="checkbox" @change="dirty = true" />
            <span>{{ t('common.enabled') }}</span>
          </label>
          <div style="color: var(--text-dim); font-size: var(--fs-xs)">{{ t('v7backtest.hlcvsCleanupHelp') }}</div>
          <div id="cleanup-opts" :style="cleanupOptsStyle">
            <div style="display: flex; gap: var(--sp-md); align-items: center">
              <div style="flex: 1">
                <div class="sb-label">{{ t('v7backtest.retentionDays') }}</div>
                <input
                  id="set-cleanup-days"
                  v-model="draft.cleanupDays"
                  type="number"
                  min="1"
                  max="365"
                  style="width: 80px"
                  @change="dirty = true"
                />
              </div>
              <div style="flex: 1">
                <div class="sb-label">{{ t('v7backtest.checkIntervalH') }}</div>
                <input
                  id="set-cleanup-interval"
                  v-model="draft.cleanupInterval"
                  type="number"
                  min="1"
                  max="168"
                  style="width: 80px"
                  @change="dirty = true"
                />
              </div>
            </div>
          </div>
          <div style="margin-top: var(--sp-sm)">
            <button id="clean-now-btn" type="button" class="modal-btn" style="font-size: var(--fs-sm)" :disabled="cleaning" @click="cleanupNow">
              {{ cleaning ? t('v7backtest.cleaning') : t('v7backtest.cleanNow') }}
            </button>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button type="button" class="modal-btn modal-btn-primary" @click="save">{{ t('common.save') }}</button>
      </div>
    </div>
  </div>
</template>
