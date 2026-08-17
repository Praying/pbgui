<script setup lang="ts">
/**
 * PBv7/PBv8 shared Run editor — the Vue port of frontend/v7_edit.html
 * (4,189 lines; legacy line refs below are provenance). Both routes serve
 * this one build: /api/v7/edit_page (api/v7_instances.py get_edit_page) and
 * /api/v8/edit_page (api/v8_instances.py get_v8_edit_page) — config.ts
 * derives the flavour from the serving path, name/new/draft_id from the
 * query string.
 *
 * ┌────────────────────────┬─ Legacy regions (M-v7-1 slice) ─────────────┐
 * │ App (this shell)       │ markup :516-565 sidebar, :567-568 content, │
 * │                        │ init :1797-1908, title :3924-3926          │
 * │ BasicSection           │ rows 1-3 :571-669                           │
 * │ AdvancedSection        │ exp-advanced :672-990                       │
 * │ FiltersSection         │ filters/coins/tags :992-1073                │
 * │ BotSection             │ bot config :1084-1124, strategy select      │
 * │                        │ :1808-1817, labels :2228-2238               │
 * │ ExtraParamsPanel       │ additional parameters :2480-2560            │
 * │ RawJsonPanel           │ raw JSON expander :1126-1140 (sync = v7-2)  │
 * │ MultiSelectField       │ .ms-wrap contract (editor_shared.js)        │
 * │ useEditPage            │ init/save orchestration :1797/:2908        │
 * │ useInstanceConfig      │ load modes :1834-1890, template :1987-2069 │
 * │ useHosts               │ host capabilities :1910-1985                │
 * │ useSymbolsTags         │ symbols/tags :2071-2184, :3727-3775        │
 * │ config/lib/*           │ run_editor_adapter.js + populate :2326-2579│
 * │                        │ + collect :2696-2905 + KNOWN_LIVE :1263    │
 * └────────────────────────┴─────────────────────────────────────────────┘
 *
 * M-v7-2 (next task) adds: backtest/strategy/balance handoffs (:1694-1795),
 * raw↔structured sync + JSON validation panels (:1368-1693, :2619-2695),
 * the coin-overrides panel (:1840-1890, coin_overrides_editor.js), the
 * import/copy modals (:2985-3286), the log panel (:3287-3385) and the
 * dynamic-ignore preview (:3386-3493). Those sidebar buttons are therefore
 * not rendered yet; the routes keep serving the legacy page until M-v7-2
 * completes the chain (recon R12 — flip only at chain end).
 *
 * Deliberate deviations (documented):
 *  - the inline %%API_BASE%%/%%INSTANCE%%/%%IS_NEW%%/%%DRAFT_ID%%/
 *    %%RUN_VERSION%%/%%MASTER_NAME%% injections are gone — boot.js plus the
 *    route path/query carry the same signals (v7_run precedent);
 *  - the form renders declaratively from a reactive state object; no
 *    innerHTML patching, and tooltips are textContent-only (XSS class R1);
 *  - save-gate JSON errors toast the legacy messages; the line-reveal
 *    validation UI arrives with M-v7-2's editor_shared validation port.
 */
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { replaceTopLocation } from '@/shared/nav';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import AdvancedSection from './components/AdvancedSection.vue';
import BasicSection from './components/BasicSection.vue';
import BotSection from './components/BotSection.vue';
import DataTipLayer from './components/DataTipLayer.vue';
import ExtraParamsPanel from './components/ExtraParamsPanel.vue';
import FiltersSection from './components/FiltersSection.vue';
import RawJsonPanel from './components/RawJsonPanel.vue';
import { provideEditPage, useEditPage } from './composables/useEditPage';
import { currentEditAdapter, editApiBase, readEditPageParams, runListUrl } from './config';
import { createToast } from './lib/toast';

const { t } = useI18n();

const adapter = currentEditAdapter(); // :1230-1232 (RUN_VERSION injection)
const apiBase = editApiBase(adapter);
const params = readEditPageParams(); // INSTANCE/IS_NEW/DRAFT_ID injections

const toastEl = useTemplateRef<HTMLElement>('toastEl');
const toast = createToast(() => toastEl.value);

const page = useEditPage({
  adapter,
  apiBase,
  params,
  t: (key, args) => t(key, args ?? {}),
  toast: (msg, kind) => toast.show(msg, kind ?? 'info'),
});
provideEditPage(page);

/** goBack (:1694-1697) — back to the run list. */
function goBack(): void {
  replaceTopLocation(runListUrl(apiBase));
}

onMounted(() => {
  document.title = t(adapter.titleKey); // :3924
  void page.load(); // init() :1797
});

onBeforeUnmount(() => {
  toast.dispose();
  page.hosts.dispose();
});
</script>

<template>
  <MigrationWatermark />
  <nav id="topnav"></nav>

  <div id="page-body">
    <!-- Sidebar (:545-565) — M-v7-1 slice: Home + Save -->
    <div id="sidebar">
      <div id="sidebar-sticky">
        <div id="sidebar-header">
          <span class="sb-title">{{ t(adapter.sidebarTitleKey) }}</span>
        </div>
        <div id="sidebar-toolbar">
          <button class="sb-btn" :title="t('v7run.backToList')" @click="goBack()">&#x1F3E0; {{ t('v7run.home') }}</button>
          <button
            class="sb-btn primary"
            id="btn-save"
            :disabled="page.saving.value"
            :title="t('v7run.saveConfigSync')"
            @click="page.save()"
          >
            <span v-if="page.saving.value" class="spinner"></span>
            <template v-else>&#x1F4BE;</template>
            {{ page.saving.value ? t('v7run.saving') : t('common.save') }}
          </button>
        </div>
      </div>
      <div id="sidebar-resize"></div>
    </div>

    <!-- Main content (:568) -->
    <div id="main-content">
      <BasicSection />
      <AdvancedSection />
      <FiltersSection />
      <!-- Coin overrides container (:1082) — M-v7-2 -->
      <BotSection />
      <ExtraParamsPanel />
      <RawJsonPanel />
    </div>
  </div><!-- /page-body -->

  <div ref="toastEl" id="toast"></div>
  <DataTipLayer />
</template>
