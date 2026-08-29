<script setup lang="ts">
/**
 * Settings modal — renderSettingsModal (:1482-1540), settingsAdjustCpu
 * (:1568-1577), the dirty-guarded syncOpenSettingsModal (:1542-1558)
 * and the save payload (:1587-1619). The clean-now POST runs in App
 * (useSettings.cleanHlcvsNow); the busy visual (:1624) arrives via the
 * `cleaning` prop.
 */
import {
  PhBroom,
  PhCpu,
  PhFloppyDisk,
  PhMinus,
  PhPlayCircle,
  PhPlus,
  PhX,
} from '@phosphor-icons/vue';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { effectiveCpuMax } from '../composables/useSettings';
import { modalBackdropClass, modalBoxClass } from '../lib/uiClasses';
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
  <div v-if="open" id="modal-root" class="open p-4" :class="modalBackdropClass">
    <div :class="[modalBoxClass, 'settings-modal w-[min(760px,calc(100vw-2rem))] max-w-none p-0 shadow-modal']" role="dialog" aria-modal="true" aria-labelledby="backtest-settings-title">
      <div class="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle bg-card px-5 py-4">
        <div class="flex min-w-0 items-start gap-3">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent-soft" aria-hidden="true"><PbIcon :icon="PhCpu" :size="18" /></span>
          <div>
            <h2 id="backtest-settings-title" class="m-0 text-xl font-semibold tracking-tight text-primary">{{ t('v7backtest.settingsTitle') }}</h2>
            <p class="mt-1 text-sm leading-relaxed text-secondary">{{ t('v7backtest.settingsOverview') }}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" class="shrink-0" :title="t('common.close')" :aria-label="t('common.close')" @click="emit('close')"><PbIcon :icon="PhX" :size="18" /></Button>
      </div>
      <div class="settings-modal-body min-h-0 flex-1 overflow-auto bg-panel p-5">
        <div class="grid gap-4">
          <section class="settings-section overflow-hidden rounded-lg border border-border-subtle bg-panel" aria-labelledby="settings-concurrency-title">
            <div class="flex items-start gap-3 border-b border-border-subtle bg-card px-4 py-3">
              <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent/8 text-accent-soft" aria-hidden="true"><PbIcon :icon="PhCpu" :size="16" /></span>
              <div><h3 id="settings-concurrency-title" class="m-0 text-md font-semibold text-primary">{{ t('v7backtest.settingsConcurrencyTitle') }}</h3><p class="mt-0.5 text-sm text-muted">{{ t('v7backtest.settingsConcurrencyHint') }}</p></div>
            </div>
            <div class="grid gap-3 px-4 py-4">
              <Label for="set-cpu-val">{{ t('v7backtest.settingsCpuSlots') }}</Label>
              <div class="flex items-center gap-2">
                <Button type="button" variant="secondary" size="icon" data-test="cpu-minus" :aria-label="t('v7backtest.decreaseCpu')" :title="t('v7backtest.decreaseCpu')" @click="adjustCpu(-1)"><PbIcon :icon="PhMinus" /></Button>
                <Input id="set-cpu-val" type="text" class="w-20 text-center font-mono text-md" :model-value="draft.cpu" readonly />
                <Button type="button" variant="secondary" size="icon" data-test="cpu-plus" :aria-label="t('v7backtest.increaseCpu')" :title="t('v7backtest.increaseCpu')" @click="adjustCpu(1)"><PbIcon :icon="PhPlus" /></Button>
                <span id="set-cpu-max" class="ml-1 rounded-full border border-border-default bg-card px-2.5 py-1 text-xs text-secondary">{{ t('v7backtest.maxCpu', { n: cpuMax }) }}</span>
              </div>
            </div>
          </section>

          <section class="settings-section overflow-hidden rounded-lg border border-border-subtle bg-panel" aria-labelledby="settings-behavior-title">
            <div class="flex items-start gap-3 border-b border-border-subtle bg-card px-4 py-3">
              <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent/8 text-accent-soft" aria-hidden="true"><PbIcon :icon="PhPlayCircle" :size="16" /></span>
              <div><h3 id="settings-behavior-title" class="m-0 text-md font-semibold text-primary">{{ t('v7backtest.settingsBehaviorTitle') }}</h3><p class="mt-0.5 text-sm text-muted">{{ t('v7backtest.settingsBehaviorHint') }}</p></div>
            </div>
            <div class="grid grid-cols-2 gap-3 px-4 py-4 max-[620px]:grid-cols-1">
              <label class="settings-toggle flex cursor-pointer items-start gap-3 rounded-md border border-border-subtle bg-card px-3 py-3 hover:border-border-default">
                <Checkbox id="set-autostart" v-model="draft.autostart" class="mt-0.5" @update:model-value="dirty = true" />
                <span><span class="block text-sm font-medium text-primary">{{ t('v7backtest.autostart') }}</span><span class="mt-0.5 block text-xs leading-relaxed text-muted">{{ t('v7backtest.autostartHint') }}</span></span>
              </label>
              <label class="settings-toggle flex cursor-pointer items-start gap-3 rounded-md border border-border-subtle bg-card px-3 py-3 hover:border-border-default">
                <Checkbox id="set-pbgui-market-data" v-model="draft.usePbguiMarketData" class="mt-0.5" @update:model-value="dirty = true" />
                <span><span class="block text-sm font-medium text-primary">{{ t('v7backtest.usePbguiMarketData') }}</span><span class="mt-0.5 block text-xs leading-relaxed text-muted">{{ t('v7backtest.usePbguiMarketDataHint') }}</span></span>
              </label>
            </div>
          </section>

          <section class="settings-section overflow-hidden rounded-lg border border-border-subtle bg-panel" aria-labelledby="settings-cleanup-title">
            <div class="flex items-start justify-between gap-3 border-b border-border-subtle bg-card px-4 py-3 max-[620px]:flex-col">
              <div class="flex items-start gap-3">
                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-warning/25 bg-warning/8 text-warning-soft" aria-hidden="true"><PbIcon :icon="PhBroom" :size="16" /></span>
                <div><h3 id="settings-cleanup-title" class="m-0 text-md font-semibold text-primary">{{ t('v7backtest.hlcvsCacheCleanup') }}</h3><p class="mt-0.5 text-sm text-muted">{{ t('v7backtest.hlcvsCleanupHelp') }}</p></div>
              </div>
              <label class="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-secondary"><Checkbox id="set-cleanup-enabled" v-model="draft.cleanupEnabled" @update:model-value="dirty = true" />{{ t('common.enabled') }}</label>
            </div>
            <div id="cleanup-opts" class="grid grid-cols-2 gap-3 px-4 py-4 transition-opacity max-[620px]:grid-cols-1" :class="draft.cleanupEnabled ? '' : 'pointer-events-none opacity-40'" :aria-disabled="!draft.cleanupEnabled">
              <div class="grid gap-1.5"><Label for="set-cleanup-days">{{ t('v7backtest.retentionDays') }}</Label><Input id="set-cleanup-days" v-model="draft.cleanupDays" type="number" min="1" max="365" class="max-w-32 font-mono" @change="dirty = true" /></div>
              <div class="grid gap-1.5"><Label for="set-cleanup-interval">{{ t('v7backtest.checkIntervalH') }}</Label><Input id="set-cleanup-interval" v-model="draft.cleanupInterval" type="number" min="1" max="168" class="max-w-32 font-mono" @change="dirty = true" /></div>
            </div>
            <div class="flex items-center justify-between gap-3 border-t border-border-subtle bg-card/50 px-4 py-3 max-[620px]:flex-col max-[620px]:items-stretch">
              <span class="text-xs leading-relaxed text-muted">{{ t('v7backtest.cleanNowHint') }}</span>
              <Button id="clean-now-btn" type="button" variant="warning" size="sm" :loading="cleaning" :disabled="cleaning" @click="cleanupNow"><PbIcon :icon="PhBroom" :size="14" />{{ cleaning ? t('v7backtest.cleaning') : t('v7backtest.cleanNow') }}</Button>
            </div>
          </section>
          </div>
      </div>
      <div class="flex shrink-0 justify-end gap-2 border-t border-border-subtle bg-card px-5 py-3.5">
        <Button type="button" variant="secondary" class="modal-btn pbgui-action" @click="emit('close')">{{ t('common.cancel') }}</Button>
        <Button type="button" variant="primary" class="modal-btn pbgui-action primary" @click="save"><PbIcon :icon="PhFloppyDisk" :size="15" />{{ t('common.save') }}</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-modal,
.settings-modal-body {
  font-family: var(--font-sans);
}

.settings-section {
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.035) inset;
}
</style>
