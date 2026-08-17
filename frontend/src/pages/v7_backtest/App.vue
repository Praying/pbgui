<script setup lang="ts">
/**
 * Backtest workbench shell — the M-v7-8 scaffold of
 * frontend/v7_backtest.html (10,340 L): page chrome (DOM :660-1005),
 * view-state restore + panel switching (:1331-1462), the queue WS
 * (:1267-1337), the settings modal (:1467-1642) and the queue panel
 * (:5136-5226, :5787-5871). Configs editor (M-v7-9), results/charts
 * (M-v7-10), archive/legacy (M-v7-11) and handoffs (M-v7-12) extend
 * this shell.
 *
 * FLAVOR: pathname-derived (/api/backtest-v8/ → v8, config.ts) — both
 * routers serve this one build; v8 drops the legacy panel.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PanelShell from './components/PanelShell.vue';
import QueuePanel from './components/QueuePanel.vue';
import SettingsModal from './components/SettingsModal.vue';
import { useBacktestPage } from './composables/useBacktestPage';

const { t } = useI18n();
const boot = getBoot();

const store = useBacktestPage({
  origin: boot.origin,
  t: (key, params) => t(key, params ?? {}),
});

const queuePanel = ref<InstanceType<typeof QueuePanel> | null>(null);

const bannerClass = computed(() => 'conn-' + store.banner.value);
const bannerText = computed(() =>
  store.banner.value === 'ok' ? t('v7backtest.connected') : store.banner.value === 'lost' ? t('v7backtest.connectionLost') : t('v7backtest.connecting')
);

function onQueueViewResults(name: string): void {
  /* filters + results panel land in M-v7-10 */
  store.selectPanel('results');
  void name;
}
function onQueueShowLog(filename: string): void {
  /* the LogViewerPanel wrapper lands with the M-v7-9/10 log surface */
  void filename;
}
function onQueueEditConfig(name: string): void {
  /* the configs editor opens in M-v7-9 */
  store.selectPanel('configs');
  void name;
}
function onNothingSelected(): void {
  store.notifyError(t('v7backtest.nothingSelected'));
}

declare global {
  interface Window {
    PBGuiSidebarResize?: {
      init(options: { sidebarId: string; handleId: string; minWidth: number; maxWidth: number }): void;
    };
  }
}

onMounted(() => {
  document.title = t(store.adapter.titleKey, store.adapter.titleParams);
  window.PBGuiSidebarResize?.init({ sidebarId: 'sidebar', handleId: 'sidebar-resize', minWidth: 140, maxWidth: 300 });
  store.boot();
});
</script>

<template>
  <MigrationWatermark />
  <nav id="topnav"></nav>

  <div id="conn-banner" :class="bannerClass" data-i18n="v7backtest.connecting">{{ bannerText }}</div>

  <div id="page-body">
    <PanelShell
      :items="store.nav"
      :active="store.view.state.panel"
      :queue-badge="store.queueBadge.value"
      @select="store.selectPanel"
    >
      <template #ctx-configs>
        <!-- ctx-configs actions (New/Delete) land with the M-v7-9 configs list -->
      </template>
      <template #ctx-queue>
        <button type="button" class="sb-btn" data-test="clear-finished" @click="store.clearFinished">{{ t('v7backtest.clearFinished') }}</button>
        <button type="button" class="sb-btn danger" data-test="stop-all" @click="store.stopAllQueue">{{ t('v7backtest.stopAll') }}</button>
        <button type="button" class="sb-btn danger" data-test="delete-selected" @click="queuePanel?.deleteSelected()">
          {{ t('v7backtest.deleteSelected') }}
        </button>
        <hr class="sb-sep" />
        <button type="button" class="sb-btn" data-test="open-settings" @click="store.openSettingsModal">{{ t('v7backtest.settings') }}</button>
      </template>
      <template #ctx-results>
        <!-- results actions land in M-v7-10 (Compare is queue-panel M-v7-10 too) -->
      </template>
      <template #ctx-archive>
        <!-- archive actions land in M-v7-11 -->
      </template>
      <template v-if="!store.adapter.isV8" #ctx-legacy>
        <!-- legacy actions land in M-v7-11 -->
      </template>
    </PanelShell>

    <div id="main-content">
      <!-- CONFIGS panel — list + editor land in M-v7-9 -->
      <div id="panel-configs" class="view-panel" :class="{ active: store.view.state.panel === 'configs' }">
        <div class="empty-state"><div class="empty-icon">📋</div><p>Configs list — M-v7-9</p></div>
      </div>

      <QueuePanel
        ref="queuePanel"
        :active="store.view.state.panel === 'queue'"
        :items="store.queueItems.value"
        @start="store.startQueueItem"
        @restart="store.restartQueueItem"
        @stop="store.stopQueueItem"
        @remove="store.removeQueueItem"
        @view-results="onQueueViewResults"
        @show-log="onQueueShowLog"
        @edit-config="onQueueEditConfig"
        @delete="store.deleteQueueItems"
        @nothing-selected="onNothingSelected"
      />

      <!-- RESULTS panel — table + charts land in M-v7-10 -->
      <div id="panel-results" class="view-panel" :class="{ active: store.view.state.panel === 'results' }">
        <div class="empty-state"><div class="empty-icon">📊</div><p>Results — M-v7-10</p></div>
      </div>

      <!-- ARCHIVE panel — M-v7-11 -->
      <div id="panel-archive" class="view-panel" :class="{ active: store.view.state.panel === 'archive' }">
        <div class="empty-state"><div class="empty-icon">🗄️</div><p>Archive — M-v7-11</p></div>
      </div>

      <!-- LEGACY panel — v7 only (adapter drops it on v8, :160-162) — M-v7-11 -->
      <div
        v-if="!store.adapter.isV8"
        id="panel-legacy"
        class="view-panel"
        :class="{ active: store.view.state.panel === 'legacy' }"
      >
        <div class="empty-state"><div class="empty-icon">🧭</div><p>Legacy — M-v7-11</p></div>
      </div>
    </div>
  </div>

  <div id="toast">
    <div v-for="item in store.toasts.value" :key="item.id" class="toast-msg" :class="'toast-' + item.kind">{{ item.msg }}</div>
  </div>

  <SettingsModal
    :settings="store.settingsStore.settings.value"
    :open="store.settingsOpen.value"
    :cleaning="store.settingsCleaning.value"
    @save="store.saveSettings"
    @cleanup="store.cleanNow"
    @close="store.settingsOpen.value = false"
  />
</template>
