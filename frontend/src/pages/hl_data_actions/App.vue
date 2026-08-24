<script setup lang="ts">
/*
 * HL data-actions page — the Vue port of frontend/hl_data_actions.html
 * (2,057 lines; legacy line refs below are provenance):
 *
 * ┌──────────────────────────┬─ Legacy regions ────────────────────────────┐
 * │ App (this shell)         │ root :473-507, bootstrap :509-532,          │
 * │                          │ embedded detect :512-515, section init     │
 * │                          │ :623-667, storage :630-632                  │
 * │ SectionCard ×2           │ :476-496, toggle :672-687, status :638-654  │
 * │ CoinPickerGrid ×2        │ toolbars :985-992/:1021-1031, pickers       │
 * │                          │ :1102-1286, drag/keyboard :817-921         │
 * │ JobMonitorCard +         │ monitor html :1619-1631, WS :1644-1689,     │
 * │ Active/HistoryJobCard    │ cards :1699-1818, actions :1906-2009        │
 * │ JobModal                 │ :498-506, modal flows :1929-1971            │
 * │ useHldaSections          │ init :936-963, populates :968-1053,         │
 * │                          │ submits :1555-1592, msgs :1594-1612         │
 * │ useJobsMonitor           │ tabs/history :1633-1767                     │
 * │ useModalViewport         │ viewport metrics :546-621                   │
 * └──────────────────────────┴─────────────────────────────────────────────┘
 *
 * Shell boundary (intentional): AppShell and StatusStrip are not rendered
 * here because this page is also mounted as the market-data iframe's inner
 * chrome. Adding the rail would change the embedded document's dimensions
 * and duplicate the parent page's navigation.
 *
 * NOT PORTED (documented):
 *  - The __HLDA_ROOT__/__HLDA__ prefix machinery (:473-507 +
 *    api/market_data.py _render_hl_data_actions_html) — the Vue build is a
 *    single instance served at one route; ids are literal.
 *  - The inline __dp calendar (:1321-1550) — the build dates use native
 *    <input type="date"> like the download section always did; the 'now'
 *    special value stays parseable (lib/jobsFormat) but is no longer
 *    enterable.
 *  - The legacy dropdown coin selector (cs-…/dd-… elements :1087-1100) —
 *    dead markup superseded by the inline picker grids;
 *    renderCoinOpts/updateTrigger were the last consumers.
 *
 * Deliberate deviations (documented):
 *  - WS and retry timers are disposed on unmount (legacy leaked them).
 *  - No MigrationWatermark: this page is embedded chrome (market_data
 *    iframe), not a standalone destination like the other Vue pages.
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import CoinPickerGrid from './components/CoinPickerGrid.vue';
import JobModal from './components/JobModal.vue';
import JobMonitorCard from './components/JobMonitorCard.vue';
import SectionCard from './components/SectionCard.vue';
import { useHldaSections } from './composables/useHldaSections';
import { useJobsMonitor, type ModalState, type MonitorTab } from './composables/useJobsMonitor';
import { useModalViewport } from './composables/useModalViewport';
import { initialSection } from './config';
import { fmtDay } from './lib/jobsFormat';

const { t } = useI18n();

/* ── embedded + single-section mode (:512-515, :523-524, :623-667) ── */

const showOnlySection = initialSection();
const rootEl = useTemplateRef<HTMLElement>('root');
useModalViewport(rootEl); // sets the iframe-aware modal CSS vars on #hlda-root

/* ── section open state with localStorage (:630-632, :656-667) ── */

const STORAGE_KEY = 'pbgui_hl_data_sections';

function loadSectionState(): { download: boolean; build: boolean } {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Record<'download' | 'build', boolean>>;
    return { download: Boolean(parsed.download), build: Boolean(parsed.build) };
  } catch {
    return { download: false, build: false };
  }
}

const sectionsOpen = ref(
  showOnlySection
    ? { download: showOnlySection === 'download', build: showOnlySection === 'build' }
    : loadSectionState()
);

function saveSectionState(id: 'download' | 'build', open: boolean): void {
  sectionsOpen.value = { ...sectionsOpen.value, [id]: open };
  try {
    const stored = loadSectionState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, [id]: open }));
  } catch {
    /* ignore */
  }
}

const downloadVisible = computed(() => !showOnlySection || showOnlySection === 'download');
const buildVisible = computed(() => !showOnlySection || showOnlySection === 'build');

/* ── the two sections (useHldaSections) ── */

const sections = useHldaSections({ t: (key, params) => t(key, params ?? {}) });

/* ── the two job monitors (useJobsMonitor) ── */

function reloadHistoryTabs(tab: MonitorTab): void {
  // legacy iterated both sections after delete/retry/requeue (:2000-2008)
  if (tab !== 'running') {
    void dlMonitor.loadHistory(tab);
    void buildMonitor.loadHistory(tab);
  }
}

const dlMonitor = useJobsMonitor({
  ns: 'dl',
  t: (key, params) => t(key, params ?? {}),
  onHistoryMutation: reloadHistoryTabs,
});
const buildMonitor = useJobsMonitor({
  ns: 'build',
  t: (key, params) => t(key, params ?? {}),
  onHistoryMutation: reloadHistoryTabs,
});

/* ── shared modal (:498-506 — one #modal for both sections) ── */

const HIDDEN_MODAL: ModalState = { active: false, title: '', kind: 'log', bodyText: '', detailsJob: null };
const modalState = computed<ModalState>(() =>
  buildMonitor.modal.value.active ? buildMonitor.modal.value : dlMonitor.modal.value.active ? dlMonitor.modal.value : HIDDEN_MODAL
);

function closeModal(): void {
  dlMonitor.closeModal();
  buildMonitor.closeModal();
}

/* ── init (:963 doInit(0) after wiring) ── */

onMounted(() => {
  sections.init();
  dlMonitor.connect();
  buildMonitor.connect();
});

onBeforeUnmount(() => {
  dlMonitor.disconnect();
  buildMonitor.disconnect();
});

/* ── archive labels (:979-980) ── */

const dlOldest = computed(() => (sections.dlArchive.value.oldest_day ? fmtDay(sections.dlArchive.value.oldest_day) : '?'));
const dlNewest = computed(() => (sections.dlArchive.value.newest_day ? fmtDay(sections.dlArchive.value.newest_day) : '?'));

const initRetryLabel = computed(() =>
  t('market.connectionRetrying', { current: sections.initRetry.value, max: 3 })
);
const initFailedLabel = computed(() => t('market.failedToLoad', { message: '' }));

/** Section body state for the v-if chain (loading → retrying → failed → content). */
function sectionPhase(kind: 'dl' | 'build'): string {
  const phase = sections.initPhase.value;
  if (phase === 'loading') return 'loading';
  if (phase === 'retrying') return 'retrying';
  if (phase === 'failed') return 'failed';
  if (kind === 'dl' && !sections.dlHasCreds.value) return 'no-creds';
  if (kind === 'dl' && !sections.dlCoins.value.length) return 'no-coins';
  if (kind === 'build' && !sections.buildCoins.value.length) return 'no-coins';
  return 'ready';
}

/* Result-message kind → full utility set (the former .hlda-msg.success/
   .error/.warning tints; keeps the kind test anchors). */
function msgKindClass(kind: string): string {
  if (kind === 'success') return 'success block bg-success/13 border border-success/33 text-success';
  if (kind === 'error') return 'error block bg-danger/13 border border-danger/33 text-danger';
  return 'warning block bg-warning/13 border border-warning/[33.3%] text-warning';
}
</script>

<template>
  <div ref="root" id="hlda-root" class="hlda-root m-0 p-0 font-sans leading-[1.6] text-primary" :class="{ 'show-only-section': !!showOnlySection }">
    <SectionCard
      v-if="downloadVisible"
      id="download"
      :open="sectionsOpen.download"
      title-key="market.hldaDownloadL2book"
      :active-jobs="dlMonitor.activeJobs.value"
      @toggle="saveSectionState('download', !sectionsOpen.download)"
    >
      <div v-if="sectionPhase('dl') === 'loading'" class="text-sm text-muted">{{ t('market.loading') }}</div>
      <div v-else-if="sectionPhase('dl') === 'retrying'" class="hlda-empty p-4 text-center text-sm text-muted">{{ initRetryLabel }}</div>
      <div v-else-if="sectionPhase('dl') === 'failed'" class="hlda-msg mt-2.5 rounded-md px-3 py-2 text-sm" :class="msgKindClass('error')">{{ initFailedLabel }}</div>
      <div v-else-if="sectionPhase('dl') === 'no-creds'" class="hlda-nocreds rounded-md border border-warning/[33.3%] bg-warning/13 px-3.5 py-2.5 text-sm text-warning">{{ t('market.noAwsCreds', { settings: t('market.settingsL2book') }) }}</div>
      <div v-else-if="sectionPhase('dl') === 'no-coins'" class="hlda-msg mt-2.5 rounded-md px-3 py-2 text-sm" :class="msgKindClass('warning')">{{ t('market.noDownloadableCoins') }}</div>
      <template v-else>
        <CoinPickerGrid
          ref="dlGrid"
          ns="dl"
          :rendered-coins="sections.dlRenderedCoins.value"
          :visible-count="sections.dlVisibleCoins.value.length"
          :total-coins="sections.dlCoins.value.length"
          :selected="sections.dlSelected.value"
          :filter="sections.dlFilter.value"
          @set-filter="sections.dlFilter.value = $event"
          @select-visible="sections.dlSelectVisible()"
          @clear-selection="sections.dlClearSelection()"
          @apply-selection="sections.setDlSelected"
        >
          <template #label>
            <span class="hlda-lbl mb-1 block text-sm font-medium text-secondary">{{ t('market.coinsForDownload') }}</span>
            <div class="hlda-hint mt-0.5 text-xs text-muted">{{ t('market.dlSelectionHint') }}</div>
          </template>
        </CoinPickerGrid>
        <div class="hlda-dr flex gap-3">
          <div class="hlda-fs mb-3.5 flex-1">
            <span class="hlda-lbl mb-1 block text-sm font-medium text-secondary">{{ t('market.startDate') }}</span>
            <input type="date" class="w-full rounded-md border border-border-default bg-panel px-3 py-2 text-sm text-primary hover:border-secondary" v-model="sections.dlStartDate.value">
            <div class="hlda-hint mt-0.5 text-xs text-muted">{{ t('market.archiveOldest', { date: dlOldest }) }}</div>
          </div>
          <div class="hlda-fs mb-3.5 flex-1">
            <span class="hlda-lbl mb-1 block text-sm font-medium text-secondary">{{ t('market.endDate') }}</span>
            <input type="date" class="w-full rounded-md border border-border-default bg-panel px-3 py-2 text-sm text-primary hover:border-secondary" v-model="sections.dlEndDate.value">
            <div class="hlda-hint mt-0.5 text-xs text-muted">{{ t('market.archiveNewest', { date: dlNewest }) }}</div>
          </div>
        </div>
        <div class="hlda-cb mb-1.5 flex items-center gap-2">
          <input type="checkbox" id="dl-only" class="h-4 w-4" v-model="sections.dlOnlyMissing.value">
          <label for="dl-only" class="inline mb-0 cursor-pointer text-sm text-primary">{{ t('market.onlyMissing1mSrc') }}</label>
        </div>
        <div class="hlda-help mb-2.5 ml-6 mt-0.5 text-xs text-muted">{{ t('market.dlOnlyHelp') }}</div>
        <div class="hlda-ar flex items-center gap-3.5">
          <button class="hlda-btn cursor-pointer rounded-md border-0 bg-accent px-7 py-[9px] text-base font-medium text-white transition-[background] duration-200 hover:bg-accent-soft disabled:cursor-not-allowed disabled:bg-secondary disabled:opacity-70" :disabled="sections.dlBusy.value" @click="sections.submitDownload()">{{ t('market.download') }}</button>
          <div class="hlda-lo mt-2 items-center gap-2 text-sm text-muted" :class="sections.dlBusy.value ? 'active inline-flex' : 'hidden'">
            <div class="hlda-spin h-4 w-4 animate-spin rounded-full border-2 border-border-default border-t-accent"></div><span>{{ t('market.preflightCheck') }}</span>
          </div>
        </div>
        <div class="hlda-msg mt-2.5 rounded-md px-3 py-2 text-sm" v-if="sections.dlMessage.value" :class="msgKindClass(sections.dlMessage.value.kind)">
          <template v-if="sections.dlMessage.value.parts">
            {{ sections.dlMessage.value.parts.prefix }}<strong>{{ sections.dlMessage.value.parts.jobId }}</strong>{{ sections.dlMessage.value.parts.suffix }}
            <br v-if="sections.dlMessage.value.parts.missingCoins.length">
            <small v-if="sections.dlMessage.value.parts.missingCoins.length" class="text-warning">{{
              t('market.skippedNotInArchive', { coins: sections.dlMessage.value.parts.missingCoins.join(', ') })
            }}</small>
          </template>
          <template v-else>{{ sections.dlMessage.value.text }}</template>
        </div>
        <JobMonitorCard :monitor="dlMonitor" />
      </template>
    </SectionCard>

    <SectionCard
      v-if="buildVisible"
      id="build"
      :open="sectionsOpen.build"
      title-key="market.hldaBuildBest1m"
      :active-jobs="buildMonitor.activeJobs.value"
      @toggle="saveSectionState('build', !sectionsOpen.build)"
    >
      <div v-if="sectionPhase('build') === 'loading'" class="text-sm text-muted">{{ t('market.loading') }}</div>
      <div v-else-if="sectionPhase('build') === 'retrying'" class="hlda-empty p-4 text-center text-sm text-muted">{{ initRetryLabel }}</div>
      <div v-else-if="sectionPhase('build') === 'failed'" class="hlda-msg mt-2.5 rounded-md px-3 py-2 text-sm" :class="msgKindClass('error')">{{ initFailedLabel }}</div>
      <div v-else-if="sectionPhase('build') === 'no-coins'" class="hlda-msg mt-2.5 rounded-md px-3 py-2 text-sm" :class="msgKindClass('warning')">{{ t('market.noEligibleCoins') }}</div>
      <template v-else>
        <CoinPickerGrid
          ref="buildGrid"
          ns="build"
          :rendered-coins="sections.buildRenderedCoins.value"
          :visible-count="sections.buildVisibleList.value.length"
          :total-coins="sections.buildCoins.value.length"
          :selected="sections.buildSelected.value"
          :filter="sections.buildFilter.value"
          show-tradfi-toggle
          show-no-local-toggle
          :tradfi-only="sections.buildTradfiOnly.value"
          :no-local-data="sections.buildNoLocalData.value"
          @set-filter="sections.buildFilter.value = $event"
          @select-visible="sections.buildSelectVisible()"
          @clear-selection="sections.buildClearSelection()"
          @toggle-tradfi="sections.toggleTradfiOnly()"
          @toggle-no-local="sections.toggleNoLocalData()"
          @apply-selection="sections.setBuildSelected"
        >
          <template #label>
            <span class="hlda-lbl mb-1 block text-sm font-medium text-secondary">{{ t('market.coinsForBuild') }}</span>
            <div class="hlda-hint mt-0.5 text-xs text-muted">{{ t('market.buildSelectionHint') }}</div>
          </template>
        </CoinPickerGrid>
        <div class="hlda-br flex flex-wrap items-end gap-3">
          <div class="hlda-fs mb-3.5 min-w-[140px] flex-1">
            <span class="hlda-lbl mb-1 block text-sm font-medium text-secondary">{{ t('market.startDateOptional') }}</span>
            <input type="date" class="w-full rounded-md border border-border-default bg-panel px-3 py-2 text-sm text-primary hover:border-secondary" v-model="sections.buildStartDate.value" @change="sections.ensureBuildDateOrder('start')">
          </div>
          <div class="hlda-fs mb-3.5 min-w-[140px] flex-1">
            <span class="hlda-lbl mb-1 block text-sm font-medium text-secondary">{{ t('market.endDateOptional') }}</span>
            <input type="date" class="w-full rounded-md border border-border-default bg-panel px-3 py-2 text-sm text-primary hover:border-secondary" v-model="sections.buildEndDate.value" @change="sections.ensureBuildDateOrder('end')">
          </div>
        </div>
        <div class="hlda-cb mb-1.5 flex items-center gap-2">
          <input type="checkbox" id="build-refetch" class="h-4 w-4" v-model="sections.buildRefetch.value">
          <label for="build-refetch" class="inline mb-0 cursor-pointer text-sm text-primary">{{ t('market.refetchTradfi') }}</label>
        </div>
        <div class="hlda-help mb-2.5 ml-6 mt-0.5 text-xs text-muted">{{ t('market.refetchHelp') }}</div>
        <div class="hlda-ar flex items-center gap-3.5">
          <button class="hlda-btn cursor-pointer rounded-md border-0 bg-accent px-7 py-[9px] text-base font-medium text-white transition-[background] duration-200 hover:bg-accent-soft disabled:cursor-not-allowed disabled:bg-secondary disabled:opacity-70" :disabled="sections.buildBusy.value" @click="sections.submitBuild()">{{ t('market.buildBest1m') }}</button>
          <div class="hlda-lo mt-2 items-center gap-2 text-sm text-muted" :class="sections.buildBusy.value ? 'active inline-flex' : 'hidden'">
            <div class="hlda-spin h-4 w-4 animate-spin rounded-full border-2 border-border-default border-t-accent"></div><span>{{ t('market.queuing') }}</span>
          </div>
        </div>
        <div class="hlda-msg mt-2.5 rounded-md px-3 py-2 text-sm" v-if="sections.buildMessage.value" :class="msgKindClass(sections.buildMessage.value.kind)">
          <template v-if="sections.buildMessage.value.parts">
            {{ sections.buildMessage.value.parts.prefix }}<strong>{{ sections.buildMessage.value.parts.jobId }}</strong>{{ sections.buildMessage.value.parts.suffix }}
          </template>
          <template v-else>{{ sections.buildMessage.value.text }}</template>
        </div>
        <JobMonitorCard :monitor="buildMonitor" />
      </template>
    </SectionCard>

    <JobModal :modal="modalState" @close="closeModal()" />
  </div>
</template>

<style>
/* Root rules ported from styles/hlda.css — html/body carry no scope
   attribute, so this block must stay unscoped. The .hlda-embedded class is
   added by index.html when the page runs inside the market-data iframe. */
html,
body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow-x: hidden;
}

html.hlda-embedded,
body.hlda-embedded {
  overflow: hidden;
}
</style>

<style scoped>
/* Embedded single-section mode — ported from .hlda-root.show-only-section in
   styles/hlda.css. A root-class toggle restyling descendants cannot be
   expressed as utilities, and these unlayered rules also outrank the utility
   layer, so the utilities below stay fully overridden in this mode. */
.hlda-root.show-only-section :deep(.hlda-section) {
  border: 0;
  border-radius: 0;
  margin-bottom: 0;
  overflow: visible;
}

.hlda-root.show-only-section :deep(.hlda-sh) {
  display: none;
}

.hlda-root.show-only-section :deep(.hlda-sb) {
  display: block;
  padding: 0;
}

.hlda-root.show-only-section :deep(.hlda-jm) {
  margin-top: 20px;
}

/* Native date-picker icon tint — pseudo-element, not expressible as a
   utility. */
input[type='date']::-webkit-calendar-picker-indicator {
  filter: invert(0.7);
}
</style>
