<script setup lang="ts">
/*
 * The sidebar — legacy #sidebar markup (:1456-1476) plus the toolbar button
 * state (syncToggleButtons :2118-2124, CMC gating renderSidebarMeta
 * :2283-2291 and count labels renderSummaries :2294-2315). Purely
 * presentational: the store owns the state, App wires the handlers.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TableViewName } from '../types';

const props = defineProps<{
  activeView: TableViewName;
  counts: { main: number; unmatched_visible: number; hip3: number };
  hip3VisibleCount: number;
  hip3Dex: string;
  onlyCpt: boolean;
  supportsHip3: boolean;
  supportsCopyTrading: boolean;
  hasMaterializedCmcKey: boolean;
  cmcDisabledReason: string;
  actionStatus: { message: string; isError: boolean };
}>();

defineEmits<{
  (e: 'refresh-exchange'): void;
  (e: 'refresh-all'): void;
  (e: 'refresh-cmc'): void;
  (e: 'refresh-cmc-all'): void;
  (e: 'set-view', view: TableViewName): void;
  (e: 'toggle-only-cpt'): void;
}>();

const { t } = useI18n();

const cmcTitle = computed(() =>
  props.hasMaterializedCmcKey ? undefined : props.cmcDisabledReason + t('market.cachedCoinDataReadable') // :2290
);

const hip3CountLabel = computed(() =>
  props.hip3Dex
    ? `${props.hip3VisibleCount} of ${props.counts.hip3}` // :2297-2299
    : String(props.hip3VisibleCount)
);
</script>

<template>
  <aside id="sidebar">
    <div id="sidebar-sticky">
      <div id="sidebar-header">
        <span class="sb-title">{{ t('market.coinData') }}</span>
        <span class="sb-count" id="sb-count">{{ t('market.rowsCount', { count: activeView === 'main' ? counts.main : activeView === 'unmatched' ? counts.unmatched_visible : hip3VisibleCount }) }}</span>
      </div>

      <div id="sidebar-toolbar">
        <button class="sb-btn pbgui-btn btn-primary" id="btn-refresh-exchange" @click="$emit('refresh-exchange')">{{ t('market.refreshSelectedExchange') }}</button>
        <button class="sb-btn pbgui-btn btn-info" id="btn-refresh-all" @click="$emit('refresh-all')">{{ t('market.refreshAllExchanges') }}</button>
        <button
          class="sb-btn pbgui-btn btn-info"
          id="btn-refresh-cmc"
          :disabled="!hasMaterializedCmcKey"
          :title="cmcTitle"
          @click="$emit('refresh-cmc')"
        >{{ t('market.refreshCmcSelected') }}</button>
        <button
          class="sb-btn pbgui-btn btn-info"
          id="btn-refresh-cmc-all"
          :disabled="!hasMaterializedCmcKey"
          :title="cmcTitle"
          @click="$emit('refresh-cmc-all')"
        >{{ t('market.refreshCmcAll') }}</button>
        <hr class="sb-sep">
        <button
          class="sb-btn pbgui-btn"
          id="btn-view-main"
          :class="{ active: activeView === 'main' }"
          @click="$emit('set-view', 'main')"
        >{{ t('market.matchedSymbolsCount', { count: counts.main }) }}</button>
        <button
          class="sb-btn pbgui-btn"
          id="btn-view-unmatched"
          :class="{ active: activeView === 'unmatched' }"
          @click="$emit('set-view', 'unmatched')"
        >{{ t('market.cmcUnmatchedCount', { count: counts.unmatched_visible }) }}</button>
        <button
          v-if="supportsHip3"
          class="sb-btn pbgui-btn"
          id="btn-view-hip3"
          :class="{ active: activeView === 'hip3' }"
          @click="$emit('set-view', 'hip3')"
        >{{ t('market.hip3SymbolsCount', { count: hip3CountLabel }) }}</button>
        <button
          v-if="supportsCopyTrading"
          class="sb-btn pbgui-btn"
          id="btn-only-cpt"
          :class="{ active: onlyCpt }"
          @click="$emit('toggle-only-cpt')"
        >{{ t('market.onlyCopyTrading') }}</button>
      </div>
    </div>
    <!-- Legacy #action-status had no element in the DOM (setActionStatus's
         guard made it a silent no-op); the status line is rendered here so
         load/refresh errors are visible — documented deviation. -->
    <div id="action-status" :style="{ color: actionStatus.isError ? '#fca5a5' : '#94a3b8' }">{{ actionStatus.message }}</div>
    <div id="sidebar-resize"></div>
  </aside>
</template>
