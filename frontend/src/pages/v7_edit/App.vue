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
 * │ App (this shell)       │ markup :516-568 (sidebar :545-565 became a    │
 * │                        │ top page-toolbar strip, v7_run precedent),   │
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
 *  - the number-stepper auto-wrap (:4157-4182) is not ported;
 *  - the forced_mode_* selects' empty-value option ("no override") has no
 *    listbox row in the ui/select migration (reka forbids value="") — the
 *    model can still be empty, but resetting via the list is gone.
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
import { Button } from '@/shared/components/ui/button';
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
import { useAiPageAction, useAiPageContext } from '@/shared/ai/context';
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

/* AI drawer page context — Vue port of the legacy run-config-editor
   registration (open instance as run_config entity). */
useAiPageContext({
  id: 'run-config-editor',
  getContext: () => ({
    section: 'Run config editor',
    entities: page.instanceName.value ? [{ kind: 'run_config', version: adapter.version, name: page.instanceName.value }] : [],
  }),
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

/* AI drawer action (v1.99.2): show_log opens this instance's live-log
   panel through the generic page-action bridge (legacy openLogPanel). */
useAiPageAction({
  id: 'show_log',
  entity_kind: 'run_config',
  run: (name) => {
    if (name !== page.instanceName.value) return;
    logOpen.value = true;
  },
});
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

    <div id="page-body" class="flex h-[calc(100dvh-52px)] flex-col overflow-hidden">
    <!-- Main content (:568). The legacy sidebar column (:545-565) became a
         top strip (v7_run precedent): same buttons, ids and gating; the
         drag-resize handle left with the column. -->
    <div class="workbench-page-content flex-1 overflow-y-auto p-5 max-[700px]:p-2">
      <div class="page-toolbar" role="toolbar" :aria-label="t(adapter.sidebarTitleKey)">
        <span class="sb-label">{{ t(adapter.sidebarTitleKey) }}</span>
        <hr class="sb-sep" />
        <Button type="button" :title="t('v7run.backToList')" @click="goBack()"><PbIcon :icon="PhHouse" /> {{ t('v7run.home') }}</Button>
        <Button
          variant="info"
          type="button"
          id="btn-save"
          :loading="page.saving.value"
          :title="t('v7run.saveConfigSync')"
          @click="page.save()"
        >
          <PbIcon v-if="!page.saving.value" :icon="PhFloppyDisk" />
          {{ page.saving.value ? t('v7run.saving') : t('common.save') }}
        </Button>
        <Button variant="info" type="button" :title="t('v7run.importJsonConfig')" @click="openImport()"><PbIcon :icon="PhUploadSimple" /> {{ t('v7run.import') }}</Button>
        <Button variant="info" type="button" :title="t('v7run.copyCurrentConfig')" @click="openCopy()"><PbIcon :icon="PhCopy" /> {{ t('v7run.copy') }}</Button>
        <hr class="sb-sep" />
        <Button type="button" :title="t('v7run.openInBacktest')" @click="handoffs.goBacktest()"><PbIcon :icon="PhChartBar" /> {{ t('v7run.backtest') }}</Button>
        <Button type="button" :title="t('v7run.openStrategyExplorer')" @click="handoffs.goStrategyExplorer()"><PbIcon :icon="PhMagnifyingGlass" /> {{ t('v7run.strategyExplorer') }}</Button>
        <Button type="button" :title="t('v7run.openBalanceCalculatorPage')" @click="handoffs.goBalanceCalc()"><PbIcon :icon="PhWallet" /> {{ t('v7run.balanceCalculator') }}</Button>
        <Button type="button" :title="t('v7run.calcBalanceTitle')" @click="openBalanceCalc()"><PbIcon :icon="PhLightning" /> {{ t('v7run.calcBalance') }}</Button>
        <hr class="sb-sep" />
        <Button
          type="button"
          id="btn-log"
          :variant="logOpen ? 'info' : 'default'"
          :title="t('v7run.livePassivbotLog')"
          @click="logOpen = !logOpen"
        ><PbIcon :icon="PhFileText" /> {{ t('v7run.log') }}</Button>
      </div>
      <section
        v-if="migrationReviewFields.length"
        class="mb-4 rounded-md border border-l-4 border-l-warning border-warning/48 bg-warning/10 px-3.5 py-3 leading-[1.45] text-warning-soft"
        data-test="migration-review-notice"
        role="status"
      >
        <strong class="mb-1 block text-warning">{{ t('v7run.migrationReviewTitle') }}</strong>
        <p>{{ page.migrationMessage.value || t('v7run.migrationReviewMessage') }}</p>
        <ul class="mt-2 ml-5 list-disc">
          <li v-for="field in migrationReviewFields" :key="field"><code class="text-warning-soft">{{ field }}<template v-if="Object.prototype.hasOwnProperty.call(page.migrationReviewValues.value, field)"> = {{ JSON.stringify(page.migrationReviewValues.value[field]) }}</template></code></li>
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

  <div ref="toastEl" id="toast" class="fixed bottom-5 right-5 z-[2000] hidden rounded-md px-5 py-2 text-sm font-semibold transition-opacity duration-300"></div>
  <DataTipLayer />
</template>

<style>
/* ═══════════════════════════════════════════════════════════════
   Ported from styles/v7-edit.css (deleted at the Tailwind migration).
   Everything expressible as utilities moved onto the templates; the
   rules below stay as CSS for the documented reasons. This block is
   unscoped on purpose — the old stylesheet was page-global, and the
   html/body rules have no component root to scope to.

   Dropped outright: the *, ::before/::after reset, [hidden], the :root
   legacy alias block and the body font/background defaults — the base
   layer + alias block in src/styles/tailwind.css already provide them
   identically — plus .run-version-hidden, .toast-ok/.toast-err/
   .toast-info and #btn-log.active (the sidebar.css rule went with the
   sidebar; the open state is now Tailwind utilities bound in the
   template, which outrank the components-layer .sb-btn).
   ═══════════════════════════════════════════════════════════════ */

/* ── Page root chrome ──────────────────────────────────────────
   html/body carry no scope attribute; the base layer covers height,
   font and colours, so only the page's overflow lock and the legacy
   body flex column remain. */
html,
body {
  overflow: hidden;
}

body {
  display: flex;
  flex-direction: column;
}

/* ── Wide-screen form column centring ──────────────────────────
   Child selector, and the CoinOverridesPanel child is a shared
   component that cannot carry this page's utilities. */
.workbench-page-content > * {
  width: 100%;
  max-width: 1420px;
  margin-inline: auto;
}

/* ── Shared editor form system ─────────────────────────────────
   src/shared/coinOverrides/components/CoinOverridesPanel.vue renders
   .expander / .form-group / .form-row / .ms-* / .json-editor markup
   whose class names are a cross-page contract (v7_backtest styles
   the same classes from its own stylesheet), so they cannot become
   this page's utilities. Form controls themselves moved to the
   shared ui/ layer; the .act-btn, .cov-param-input, .cov-param-select
   and .chk-row input rules are retired (zero consumers). The
   page-local field primitives (Field*.vue, MultiSelectField,
   ExpanderGroup) reuse the identical contract. Un-layered like the
   old v7-edit.css so the rules outrank the layered base-layer form
   defaults; utilities must therefore not fight these on the same
   properties (the reason #cfg-raw-json and .user-combobox input
   tweaks live here too). */

/* data-tip tooltip affordance — attribute selector, and the shared
   CoinOverridesPanel also renders [data-tip] spans. */
[data-tip] {
  cursor: help;
  border-bottom: none;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--text-muted);
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}

/* Form grid */
.form-row {
  display: grid;
  gap: var(--sp-md);
  margin-bottom: var(--sp-md);
}
.cols-2 { grid-template-columns: 1fr 1fr; }
.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
.cols-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
.cols-8 { grid-template-columns: repeat(8, minmax(0, 1fr)); }
.span-4 { grid-column: span 4; }
@media (max-width: 1400px) { .cols-8 { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 700px) {
  .cols-8 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cols-4, .cols-3, .cols-2 { grid-template-columns: 1fr; }
  .span-4 { grid-column: 1 / -1; }
}

.form-group { display: flex; flex-direction: column; min-width: 0; }
.form-group label {
  font-size: var(--fs-xs); color: var(--text-dim); margin-bottom: 2px;
  display: flex; align-items: center; gap: 4px;
  flex-wrap: wrap; white-space: normal; overflow: visible; line-height: 1.2; min-width: 0;
  min-height: 2.4em; align-content: flex-start;
}
.form-group label,
.chk-row label {
  overflow-wrap: anywhere;
  word-break: break-word;
}
.form-group label span,
.chk-row label span {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.form-group input, .form-group select, .form-group textarea {
  height: var(--input-h); padding: 0 var(--sp-sm);
  /* section panels sit on --bg2, so inputs carve back to the page tone */
  background: var(--bg); color: var(--text); border: 1px solid var(--border);
  border-radius: 4px; font-size: var(--fs-sm); font-family: var(--font);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-group input:hover, .form-group select:hover, .form-group textarea:hover {
  border-color: var(--border-strong);
}
.form-group input:focus, .form-group select:focus, .form-group textarea:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px rgb(var(--accent-rgb) / 0.22);
}
.form-group input:read-only {
  background: var(--bg3); color: var(--text-dim); cursor: default;
}
.form-group input[type="number"] { font-variant-numeric: tabular-nums; }
.form-group textarea { height: auto; padding: var(--sp-sm); resize: vertical; }

/* Checkbox row */
.chk-row { display: flex; align-items: flex-start; gap: 6px; min-height: var(--input-h); height: auto; min-width: 0; }
.chk-row label {
  font-size: var(--fs-sm); color: var(--text); margin: 0; cursor: pointer;
  white-space: normal; overflow: visible; line-height: 1.2; min-width: 0; flex: 1 1 auto;
}

/* Expanders — shared panel + the page's ExpanderGroup primitive */
.expander {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg2);
  overflow: hidden;
}
.expander-header {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 10px var(--sp-lg); cursor: pointer;
  background: var(--bg3); color: var(--text);
  border: none; border-bottom: 1px solid transparent;
  font-size: var(--fs-md); font-weight: 700; font-family: var(--font);
  letter-spacing: 0.01em; text-align: left;
  user-select: none;
  transition: background 0.15s;
}
.expander.open .expander-header { border-bottom-color: var(--border); }
.expander-header:hover { background: var(--bg-elevated); }
.expander-header:focus-visible {
  outline: 2px solid var(--accent); outline-offset: -2px;
}
.expander-header:active { transform: translateY(1px); }
.expander-header .arrow {
  transition: transform 0.18s ease; color: var(--text-dim);
  font-size: 11px; flex-shrink: 0;
}
.expander.open .expander-header .arrow { transform: rotate(90deg); color: var(--accent); }
.expander-body { display: none; padding: var(--sp-lg); }
.expander.open .expander-body { display: block; }
.expander-body > .form-row:last-child { margin-bottom: 0; }
/* page sections keep the edit-section-body anchor class for this reset */
.edit-section-body > .form-row:last-child,
.edit-section-body > div:last-child > .form-row:last-child { margin-bottom: 0; }

/* Multiselect (tag-input) */
.ms-wrap {
  border: 1px solid var(--border); border-radius: 4px;
  background: var(--bg); min-height: var(--input-h); padding: 2px 4px;
  display: flex; flex-wrap: wrap; gap: 3px; align-items: center;
  cursor: text; position: relative;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ms-wrap:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgb(var(--accent-rgb) / 0.22);
}
.form-group .ms-wrap input.ms-input {
  border: none; background: transparent; padding: 0; height: 24px; width: auto;
}
.ms-clear-btn {
  cursor: pointer; color: var(--text-dim); font-size: 11px; padding: 0 3px;
  border-radius: 3px; margin-left: 2px;
}
.ms-clear-btn:hover { color: var(--red); background: rgb(var(--danger-rgb) / 0.15); }
.ms-all-btn {
  cursor: pointer; color: var(--text-dim); font-size: 11px; padding: 0 3px;
  border-radius: 3px; margin-left: 2px;
}
.ms-all-btn:hover { color: var(--accent); background: rgb(var(--accent-rgb) / 0.15); }
.ms-tag {
  display: inline-flex; align-items: center; gap: 3px;
  background: var(--bg3); border: 1px solid var(--border); border-radius: 3px;
  padding: 1px 6px; font-size: var(--fs-xs); color: var(--text);
}
.ms-tag .ms-x {
  cursor: pointer; color: var(--text-dim); font-size: 11px; line-height: 1;
}
.ms-tag .ms-x:hover { color: var(--red); }
.ms-input {
  border: none; background: transparent; color: var(--text);
  font-size: var(--fs-sm); outline: none; min-width: 60px; flex: 1;
  height: 24px; font-family: var(--font);
}
.ms-dropdown {
  position: absolute; top: 100%; left: 0; right: 0;
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 0 0 4px 4px; max-height: 200px; overflow-y: auto;
  z-index: 100; display: none;
}
.ms-dropdown.open { display: block; }
.ms-option {
  padding: 4px 8px; font-size: var(--fs-sm); cursor: pointer;
}
.ms-option:hover, .ms-option.highlight, .ms-option.highlighted { background: var(--bg3); }
.ms-option.selected { color: var(--accent); }

/* JSON editor */
.json-editor {
  width: 100%; min-height: 200px; max-height: 500px;
  font-family: var(--font-mono);
  font-size: var(--fs-xs); line-height: 1.4;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: var(--sp-sm); resize: vertical;
  color: var(--text); tab-size: 4;
}
textarea.json-invalid,
textarea.json-invalid:focus {
  border-color: var(--red);
}
/* overlays render behind this textarea — background must stay transparent,
   which a utility cannot win against the un-layered .json-editor rule */
#cfg-raw-json { position: relative; z-index: 3; background: transparent; }

/* Import modal combobox input — tweaks the .form-group input padding */
.user-combobox input { width: 100%; padding-right: 34px; }

/* Coin Overrides (shared CoinOverridesPanel; tooltip renders as rows) */
.cov-badge {
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  font-size: var(--fs-xs); background: var(--bg3); color: var(--text-dim);
  border: 1px solid var(--border); cursor: default;
}
.cov-badge:hover { border-color: var(--accent); color: var(--text); }
.cov-tt-tbl {
  display: flex; flex-direction: column; gap: 2px; margin: var(--sp-xs) 0;
  padding: var(--sp-xs); background: var(--bg3); border: 1px solid var(--border);
  border-radius: 6px; font-size: var(--fs-xs); color: var(--text-dim);
}
.cov-tt-row { display: flex; gap: var(--sp-sm); word-break: break-all; }
.cov-tt-key { color: var(--accent); white-space: nowrap; }
.cov-cfg-ta { min-height: 100px; max-height: none; }
.cov-json-status { display: none; margin-top: 4px; font-size: var(--fs-sm); line-height: 1.35; }
.cov-json-status.error {
  display: block; padding: 6px 10px; border: 1px solid rgb(var(--danger-rgb) / 0.35);
  border-radius: 4px; background: rgb(var(--danger-deep-rgb) / 0.35); color: var(--red);
}
textarea.cov-json-invalid,
textarea.cov-json-invalid:focus { border-color: var(--red) !important; }
</style>
