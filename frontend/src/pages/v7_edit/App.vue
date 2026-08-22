<script setup lang="ts">
/**
 * PBv7/PBv8 shared Run editor — the Vue port of frontend/v7_edit.html
 * (4,189 lines; legacy line refs below are provenance). Both routes serve
 * this one build: /api/v7/edit_page (api/v7_instances.py get_edit_page) and
 * /api/v8/edit_page (api/v8_instances.py get_v8_edit_page) — config.ts
 * derives the flavour from the serving path, name/new/draft_id from the
 * query string.
 *
 * ┌────────────────────────┬─ Legacy regions ─────────────────────────────┐
 * │ App (this shell)       │ markup :516-565 sidebar, :567-568 content,   │
 * │                        │ init :1797-1908, title :3924-3926            │
 * │ BasicSection           │ rows 1-3 :571-669                            │
 * │ AdvancedSection        │ exp-advanced :672-990                        │
 * │ FiltersSection         │ filters/coins/tags :992-1073                 │
 * │ DynamicIgnorePreview   │ preview :1075-1079 + :3386-3446              │
 * │ CoinOverridesPanel     │ container :1082 + coin_overrides_editor.js   │
 * │ BotSection             │ bot config :1084-1124, strategy select       │
 * │                        │ :1808-1817, labels :2228-2238                │
 * │ ExtraParamsPanel       │ additional parameters :2480-2560             │
 * │ RawJsonEditor          │ raw JSON expander :1126-1140 + sync          │
 * │                        │ :1368-1693/:2619-2695                        │
 * │ CopyUserModal          │ :1193-1210 + doCopyToUser :2985-3112         │
 * │ ImportModal            │ :1172-1191 + combobox :3115-3280             │
 * │ BalanceCalcModal       │ :1156-1170 + calculateBalance :3812-3901     │
 * │ LogPanel               │ :1142-1150 + openLogPanel :3287-3383         │
 * │ useEditPage            │ init/save orchestration :1797/:2908          │
 * │ useInstanceConfig      │ load modes :1834-1890, template :1987-2069   │
 * │ useHosts               │ host capabilities :1910-1985                 │
 * │ useSymbolsTags         │ symbols/tags :2071-2184, :3727-3775          │
 * │ useJsonSync            │ createJsonSyncController + :2619-2695        │
 * │ useDraftHandoffs       │ goBacktest/goStrategy/balance :1694-1794     │
 * │ config/lib/*           │ run_editor_adapter.js + populate :2326-2579  │
 * │                        │ + collect :2696-2905 + KNOWN_LIVE :1263      │
 * └────────────────────────┴──────────────────────────────────────────────┘
 *
 * Deliberate deviations (documented):
 *  - the inline %%API_BASE%%/%%INSTANCE%%/%%IS_NEW%%/%%DRAFT_ID%%/
 *    %%RUN_VERSION%%/%%MASTER_NAME%% injections are gone — boot.js plus the
 *    route path/query carry the same signals (v7_run precedent); the v8 log
 *    panel resolves the master name from /api/server-status instead;
 *  - the form renders declaratively from a reactive state object; no
 *    innerHTML patching, tooltips are textContent-only and the bot-JSON
 *    highlight overlay renders escaped spans (XSS class R1);
 *  - the page-local guide overlay with its unescaped mdToHtml copy (:3999-
 *    4152) is dropped in favour of the global shared_help_overlay.js +
 *    PBGUI_HELP_OPENER hook (R1, recon §2 recommendation);
 *  - legacy toasts with the undefined 'warn' class render as 'info';
 *  - the number-stepper auto-wrap (:4157-4182) is not ported.
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import {
  PhChartBar,
  PhCopy,
  PhFileText,
  PhFloppyDisk,
  PhHouse,
  PhLightning,
  PhMagnifyingGlass,
  PhQuestion,
  PhUploadSimple,
  PhWallet,
} from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { replaceTopLocation } from '@/shared/nav';
import AppShell from '@/shared/components/AppShell.vue';
import IconButton from '@/shared/components/IconButton.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import CoinOverridesPanel from '@/shared/coinOverrides/components/CoinOverridesPanel.vue';
import AdvancedSection from './components/AdvancedSection.vue';
import BasicSection from './components/BasicSection.vue';
import BalanceCalcModal from './components/BalanceCalcModal.vue';
import BotSection from './components/BotSection.vue';
import CopyUserModal from './components/CopyUserModal.vue';
import DataTipLayer from './components/DataTipLayer.vue';
import DynamicIgnorePreview from './components/DynamicIgnorePreview.vue';
import ExtraParamsPanel from './components/ExtraParamsPanel.vue';
import FiltersSection from './components/FiltersSection.vue';
import ImportModal from './components/ImportModal.vue';
import LogPanel from './components/LogPanel.vue';
import RawJsonEditor from './components/RawJsonEditor.vue';
import { provideEditPage, useEditPage } from './composables/useEditPage';
import { useDraftHandoffs } from './composables/useDraftHandoffs';
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

const migrationReviewFields = computed(() => {
  const report = page.migrationReport.value;
  if (!report || typeof report !== 'object') return [];
  const fields: string[] = [];
  for (const values of [report.manual_review_fields, report.dropped_unsupported_fields]) {
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const field = String(value ?? '').trim();
      if (field && !fields.includes(field)) fields.push(field);
    }
  }
  return fields.slice(0, 20);
});
provideEditPage(page);

const copyOpen = ref(false);
const importOpen = ref(false);
const balanceOpen = ref(false);
const logOpen = ref(false);
const copyModal = useTemplateRef<InstanceType<typeof CopyUserModal>>('copyModal');
const importModal = useTemplateRef<InstanceType<typeof ImportModal>>('importModal');
const balanceModal = useTemplateRef<InstanceType<typeof BalanceCalcModal>>('balanceModal');

const handoffs = useDraftHandoffs({
  adapter,
  apiBase,
  validateForHandoff: () => page.validateForSave(),
  collectConfig: () => page.collect(),
  snapshotOverrideFiles: () => page.coinOverrides.snapshotAllFiles(),
  selectedUserExchange: () => page.selectedUserExchange(),
  draftName: () => page.draftName(),
  onError: (messageKey, detail) => {
    const prefix = t(messageKey);
    toast.show(detail ? prefix + ': ' + detail : prefix, 'err');
  },
});

/** goBack (:1694-1697) — back to the run list. */
function goBack(): void {
  replaceTopLocation(runListUrl(apiBase));
}

function openCopy(): void {
  copyModal.value?.show();
}

function openImport(): void {
  importModal.value?.show();
}

function openBalanceCalc(): void {
  void balanceModal.value?.show();
}

function openEditHelp(): void {
  window.PBGUI_HELP_OPENER?.();
}

/** PBGUI_HELP_OPENER (:4184-4187) — global shared help overlay. */
declare global {
  interface Window {
    PBGUI_HELP_OPENER?: () => void;
  }
}

onMounted(() => {
  document.title = t(adapter.titleKey); // :3924
  window.PBGUI_HELP_OPENER = () => {
    const shared = (window as Window & { PBGuiSharedHelp?: { open?: (k: string) => void } }).PBGuiSharedHelp;
    shared?.open?.(adapter.isV8 ? 'pbv8 run' : 'pbv7 run');
  };
  unbindStructuredSync = page.jsonSync.bindStructuredSyncRoot('main-content'); // :2687-2693
  void page.load(); // init() :1797
});

let unbindStructuredSync: () => void = () => undefined;

onBeforeUnmount(() => {
  unbindStructuredSync();
  toast.dispose();
  page.jsonSync.dispose();
  page.hosts.dispose();
  if (window.PBGUI_HELP_OPENER) delete window.PBGUI_HELP_OPENER;
});
</script>

<template>
  <MigrationWatermark />
  <AppShell
    class="core-workbench-shell core-workbench-shell--edit"
    :page-key="adapter.navCurrent"
    :page-title="t(adapter.titleKey)"
    :page-family="adapter.isV8 ? 'PBv8' : 'PBv7'"
  >
    <template #header-actions>
      <IconButton
        class="pbgui-icon-button"
        :icon="PhQuestion"
        :label="t('nav.guide')"
        @click="openEditHelp"
      />
    </template>

    <div id="page-body">
    <!-- Sidebar (:545-565) -->
    <div id="sidebar">
      <div id="sidebar-sticky">
        <div id="sidebar-header">
          <span class="sb-title">{{ t(adapter.sidebarTitleKey) }}</span>
        </div>
        <div id="sidebar-toolbar">
          <button class="sb-btn" :title="t('v7run.backToList')" @click="goBack()"><PbIcon :icon="PhHouse" /> {{ t('v7run.home') }}</button>
          <button
            class="sb-btn primary"
            id="btn-save"
            :disabled="page.saving.value"
            :title="t('v7run.saveConfigSync')"
            @click="page.save()"
          >
            <span v-if="page.saving.value" class="spinner"></span>
            <PbIcon v-else :icon="PhFloppyDisk" />
            {{ page.saving.value ? t('v7run.saving') : t('common.save') }}
          </button>
          <button class="sb-btn info" :title="t('v7run.importJsonConfig')" @click="openImport()"><PbIcon :icon="PhUploadSimple" /> {{ t('v7run.import') }}</button>
          <button class="sb-btn info" :title="t('v7run.copyCurrentConfig')" @click="openCopy()"><PbIcon :icon="PhCopy" /> {{ t('v7run.copy') }}</button>
          <hr class="sb-sep" />
          <button class="sb-btn" :title="t('v7run.openInBacktest')" @click="handoffs.goBacktest()"><PbIcon :icon="PhChartBar" /> {{ t('v7run.backtest') }}</button>
          <button class="sb-btn" :title="t('v7run.openStrategyExplorer')" @click="handoffs.goStrategyExplorer()"><PbIcon :icon="PhMagnifyingGlass" /> {{ t('v7run.strategyExplorer') }}</button>
          <button class="sb-btn" :title="t('v7run.openBalanceCalculatorPage')" @click="handoffs.goBalanceCalc()"><PbIcon :icon="PhWallet" /> {{ t('v7run.balanceCalculator') }}</button>
          <button class="sb-btn" :title="t('v7run.calcBalanceTitle')" @click="openBalanceCalc()"><PbIcon :icon="PhLightning" /> {{ t('v7run.calcBalance') }}</button>
          <hr class="sb-sep" />
          <button class="sb-btn" id="btn-log" :class="{ active: logOpen }" :title="t('v7run.livePassivbotLog')" @click="logOpen = !logOpen"><PbIcon :icon="PhFileText" /> {{ t('v7run.log') }}</button>
        </div>
      </div>
      <div id="sidebar-resize"></div>
    </div>

    <!-- Main content (:568) -->
    <div class="workbench-page-content">
      <section v-if="migrationReviewFields.length" class="migration-review-notice" data-test="migration-review-notice" role="status">
        <strong>{{ t('v7run.migrationReviewTitle') }}</strong>
        <p>{{ page.migrationMessage.value || t('v7run.migrationReviewMessage') }}</p>
        <ul>
          <li v-for="field in migrationReviewFields" :key="field"><code>{{ field }}<template v-if="Object.prototype.hasOwnProperty.call(page.migrationReviewValues.value, field)"> = {{ JSON.stringify(page.migrationReviewValues.value[field]) }}</template></code></li>
        </ul>
      </section>
      <BasicSection />
      <AdvancedSection />
      <FiltersSection />
      <DynamicIgnorePreview v-if="!page.isV8" />
      <!-- Coin overrides container (:1082) -->
      <CoinOverridesPanel :store="page.coinOverrides" @notify="(msg, kind) => toast.show(msg, kind)" />
      <BotSection />
      <ExtraParamsPanel />
      <RawJsonEditor />
      </div>
    </div><!-- /page-body -->
  </AppShell>

  <LogPanel v-model="logOpen" />

  <CopyUserModal ref="copyModal" v-model="copyOpen" />
  <ImportModal ref="importModal" v-model="importOpen" />
  <BalanceCalcModal ref="balanceModal" v-model="balanceOpen" />

  <div ref="toastEl" id="toast"></div>
  <DataTipLayer />
</template>
