<script setup lang="ts">
/**
 * Strategy Explorer page shell — the Vue port of
 * frontend/v7_strategy_explorer.html (3,284 lines; legacy line refs below
 * are provenance). Both routes serve this one build:
 * /api/strategy-explorer/main_page (api/strategy_explorer.py) and
 * /api/strategy-explorer-v8/main_page (api/strategy_explorer_v8.py) —
 * config.ts derives the flavour from the serving path.
 *
 * ┌────────────────────────┬─ Legacy regions ─────────────────────────────┐
 * │ App (this shell)       │ markup :184-374, boot :3270-3280, stage      │
 * │                        │ switching :3066-3079, keyboard :3192-3200,   │
 * │                        │ fullscreen :3207-3217, scroll :3218-3227,    │
 * │                        │ tooltips :3228-3269, persist :3201           │
 * │ AnalysisControls       │ shared controls :216-228 + listeners          │
 * │                        │ :3160-3168                                   │
 * │ SideWorkspace          │ analysis columns :230-245, sim columns       │
 * │                        │ :288-302, active chips :1359-1364            │
 * │ ParamTuning            │ renderParamField/renderSideTuning            │
 * │                        │ :1812-1913, slider fill :572-579             │
 * │ StatsPanel             │ renderStats :1365-1389, orderRows :1179      │
 * │ ExplorerPlot           │ renderPlot :1391-1701, candle zoom :656-691  │
 * │ ExchangeStatePanel     │ renderExchangeState :1956-2004, sources      │
 * │                        │ :1943-1955                                   │
 * │ RawConfigPanel         │ editable config editor + live validation     │
 * │                        │ (Vue component; legacy :1702-1765 flow)      │
 * │ SimulationPanel        │ sim controls :266-302, modes :479-502,       │
 * │                        │ manual start :2091-2105                      │
 * │ ComparePanel           │ compare controls :304-322, result tables     │
 * │                        │ :1344-1355 (lib/compareTables)               │
 * │ MoviePanel/MoviePlot   │ movie builder :324-372, figure :2562-2813,   │
 * │                        │ renderMoviePlot :2831-2858, export :2961-3065│
 * │ useStrategyExplorer    │ state :386, options :1055-1070, snapshot     │
 * │                        │ :2006-2055, markets :1121-1161, cache :732-861│
 * │ useSession             │ loadSession/applySessionBootstrap            │
 * │                        │ :3080-3156                                   │
 * │ useSimulation          │ runSimulation + polling :2056-2180           │
 * │ useCompare             │ runCompare + polling :2181-2244              │
 * │ useMovie               │ movie flows :2375-3065                       │
 * │ lib/*                  │ pure ports (see per-file headers)            │
 * └────────────────────────┴──────────────────────────────────────────────┘
 *
 * Deliberate deviations (documented):
 *  - the inline %%TOKEN%%/%%API_BASE%%/… injections are gone — the page
 *    reads boot.js plus the route path/query (config.ts), exactly like the
 *    v7_run dual-route precedent;
 *  - tables/panels render declaratively instead of innerHTML patching
 *    (same ids/classes; no v-html for server data);
 *  - the date picker stays a window global (inline onclick handlers of the
 *    legacy calendar, lib/datePicker.ts).
 */
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import { PhQuestion } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { useAiPageContext } from '@/shared/ai/context';
import AppShell from '@/shared/components/AppShell.vue';
import IconButton from '@/shared/components/IconButton.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import type { PageSection } from '@/shared/navigation';
import AnalysisControls from './components/AnalysisControls.vue';
import ComparePanel from './components/ComparePanel.vue';
import ExchangeStatePanel from './components/ExchangeStatePanel.vue';
import MessagesBar from './components/MessagesBar.vue';
import MoviePanel from './components/MoviePanel.vue';
import RawConfigPanel from './components/RawConfigPanel.vue';
import SideWorkspace from './components/SideWorkspace.vue';
import SimulationPanel from './components/SimulationPanel.vue';
import { useExplorerPage } from './composables/useExplorerPage';
import { currentExplorerAdapter, explorerApiBase, readDraftId, readResultPath } from './config';
import { installDatePicker } from './lib/datePicker';
import { getPlotly } from './lib/plotlyVendor';

const { t } = useI18n();

/* AI drawer page context — Vue port of the legacy strategy-explorer
   registration (stage section, exchange + coin entities). */
useAiPageContext({
  id: 'strategy-explorer',
  getContext: () => {
    const entities: Array<{ kind: string; version?: string; name: string }> = [];
    if (store.controls.exchange) entities.push({ kind: 'exchange', version: adapter.isV8 ? 'v8' : 'v7', name: store.controls.exchange });
    if (store.controls.coin) entities.push({ kind: 'coin', version: adapter.isV8 ? 'v8' : 'v7', name: store.controls.coin });
    return { section: store.controls.stage, entities };
  },
});

const { adapter, origin } = currentExplorerAdapter();
const page = useExplorerPage({
  t: (key, params) => t(key, params ?? {}),
  adapterParams: {
    adapter,
    apiBase: explorerApiBase(adapter, origin),
    draftId: readDraftId(),
    resultPath: readResultPath(),
  },
});
const store = page.store;

const STAGES = [
  { key: 'analysis', labelKey: 'v7explore.analysis' },
  { key: 'exchange-state', labelKey: 'v7explore.exchangeState' },
  { key: 'raw', labelKey: 'v7explore.rawConfig' },
  { key: 'simulation', labelKey: 'v7explore.simulation' },
  { key: 'compare', labelKey: 'v7explore.compare' },
  { key: 'movie', labelKey: 'v7explore.movieBuilder' },
] as const;

/* Converged navigation: the six stages are rail sections under the active
   Strategy Explorer page item. */
const railSections = computed<PageSection[]>(() =>
  STAGES.map((stage) => ({ key: stage.key, label: t(stage.labelKey) })),
);

const subtitle = computed(() => t(adapter.subtitleKey));
const moviePanel = useTemplateRef<{ stepMovieFrame(direction: number): boolean }>('moviePanel');

/* Status chip colour sets — the former #source-chip/#ohlcv-chip/#engine-chip
   ok/warn/err variants of styles/explorer.css. Each branch (neutral default
   included) returns the FULL colour set so the static utilities on the
   element never fight a dynamic one; the anchor ok/warn/err names ride
   along on store.sourceChip.cls. */
function statusChipClass(cls: string): string {
  if (cls.includes('err')) return 'border-danger/36 bg-danger-deep/13 text-danger-soft';
  if (cls.includes('warn')) return 'border-warning/32 bg-warning-deep/12 text-warning-soft';
  if (cls.includes('ok')) return 'border-success/32 bg-success/10 text-success-soft';
  return 'border-secondary/16 bg-secondary/7 text-secondary';
}

function openStrategyHelp(): void {
  window.location.href = '/api/help/main_page?topic=00_strategy_explorer_help';
}

/** selectStage (:3066-3079) — stage switching persists the refresh state. */
function selectStage(stage: string): void {
  store.controls.stage = stage;
  if (stage === 'movie') {
    setTimeout(() => {
      const plot = document.getElementById('movie-plot');
      const plotly = getPlotly();
      if (plot && plotly && plotly.Plots) plotly.Plots.resize(plot);
    }, 0);
  }
  store.persistStrategyRefreshState();
}

/** Arrow-key movie stepper (:3192-3200). */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (store.controls.stage !== 'movie') return;
  const active = document.activeElement as HTMLElement | null;
  const tag = active && active.tagName ? active.tagName.toLowerCase() : '';
  if (active && (active.isContentEditable || tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button')) return;
  if (moviePanel.value?.stepMovieFrame(event.key === 'ArrowLeft' ? -1 : 1)) event.preventDefault();
}

/** Plotly fullscreen height relayout (:3207-3217). */
function onFullscreenChange(): void {
  const plotly = getPlotly();
  if (!plotly) return;
  const full = document.fullscreenElement;
  for (const id of ['plot-long', 'plot-short', 'sim-plot-long', 'sim-plot-short', 'movie-plot']) {
    const plot = document.getElementById(id);
    if (!plot) continue;
    const normalHeight = id === 'movie-plot' ? 760 : 520;
    const height = full === plot ? Math.max(320, window.innerHeight - 16) : normalHeight;
    setTimeout(() => {
      void plotly.relayout(plot, { height, autosize: true });
    }, 50);
  }
}

const mainContent = useTemplateRef<HTMLElement>('mainContent');
let scrollTimer: ReturnType<typeof setTimeout> | null = null;
function onScroll(): void {
  const main = mainContent.value;
  if (!main) return;
  main.classList.add('is-scrolling');
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => main.classList.remove('is-scrolling'), 140);
}

/** The floating data-tip tooltip (:3228-3269) — disposers for the three
 * document listeners (R4: the legacy page leaked them on unload). */
let disposeTooltip: (() => void) | null = null;
function installTooltip(): void {
  const tipEl = document.getElementById('data-tip-tooltip');
  if (!tipEl) return;
  const tip = tipEl as HTMLElement & { textContent: string; style: CSSStyleDeclaration };
  let lastEvent: MouseEvent | null = null;
  let frameId = 0;
  function positionTip(): void {
    frameId = 0;
    if (!lastEvent || tip.style.display === 'none') return;
    let x = lastEvent.clientX + 14;
    let y = lastEvent.clientY + 14;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    if (x + tw > window.innerWidth - 8) x = lastEvent.clientX - tw - 10;
    if (y + th > window.innerHeight - 8) y = lastEvent.clientY - th - 10;
    tip.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  }
  const onMouseOver = (e: Event) => {
    const target = e.target as HTMLElement | null;
    const el = target?.closest ? target.closest('[data-tip]') : null;
    if (!el) return;
    const text = el.getAttribute('data-tip');
    if (!text) return;
    tip.textContent = text;
    tip.style.display = 'block';
    lastEvent = e as MouseEvent;
    if (!frameId) frameId = requestAnimationFrame(positionTip);
  };
  const onMouseMove = (e: Event) => {
    if (tip.style.display === 'none') return;
    lastEvent = e as MouseEvent;
    if (!frameId) frameId = requestAnimationFrame(positionTip);
  };
  const onMouseOut = (e: Event) => {
    const target = e.target as HTMLElement | null;
    const el = target?.closest ? target.closest('[data-tip]') : null;
    if (el) {
      tip.style.display = 'none';
      lastEvent = null;
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    }
  };
  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mouseout', onMouseOut);
  disposeTooltip = () => {
    if (frameId) cancelAnimationFrame(frameId);
    document.removeEventListener('mouseover', onMouseOver);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseout', onMouseOut);
  };
}

onMounted(() => {
  (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER = openStrategyHelp;
  installDatePicker();
  installTooltip();
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('beforeunload', onBeforeUnload);
  // boot sequence (:3270-3280)
  page.configureVersionUi({});
  store.syncMovieDurationOptions();
  const initial = store.readRefreshState();
  if (initial && initial.controls && initial.controls.stage) selectStage(String(initial.controls.stage));
  if (!adapter.isV8) store.applyInitialResultPath(store.resultPath);
  void page.movie.loadMovieExportOptions();
  void page.session.loadSession();
});

function onBeforeUnload(): void {
  store.persistStrategyRefreshState();
}

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.removeEventListener('beforeunload', onBeforeUnload);
  disposeTooltip?.();
  disposeTooltip = null;
  if (scrollTimer) clearTimeout(scrollTimer);
  delete (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
});
</script>

<template>
  <MigrationWatermark />
  <AppShell
    class="core-workbench-shell core-workbench-shell--strategy"
    :page-key="adapter.navCurrent"
    :page-title="adapter.isV8 ? t('v7explore.titleV8', { label: store.strategyLabel.value }) : t('v7explore.titleV7')"
    :page-family="adapter.isV8 ? 'PBv8' : 'PBv7'"
    :sections="railSections"
    :active-section="store.controls.stage"
    @update:section="selectStage"
  >
    <template #status>
      <div class="flex items-center gap-2">
        <span id="source-chip" class="sr-only inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.25 py-1 text-xs max-[640px]:max-w-full max-[640px]:truncate" :class="[store.sourceChip.value.cls, statusChipClass(store.sourceChip.value.cls)]" :title="store.sourceChip.value.title">{{ store.sourceChip.value.text }}</span>
        <StatusStrip
          :label="t('v7explore.source')"
          :value="store.sourceChip.value.text"
          :tone="store.sourceChip.value.cls.includes('err') ? 'danger' : store.sourceChip.value.cls.includes('warn') ? 'warning' : store.sourceChip.value.cls.includes('ok') ? 'success' : 'neutral'"
        />
        <span id="ohlcv-chip" class="inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.25 py-1 text-xs max-[640px]:max-w-full max-[640px]:truncate" :class="[store.ohlcvChip.value.cls, statusChipClass(store.ohlcvChip.value.cls)]" :title="store.ohlcvChip.value.title">OHLCV: {{ store.ohlcvChip.value.text }}</span>
        <span id="engine-chip" class="inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.25 py-1 text-xs max-[640px]:max-w-full max-[640px]:truncate" :class="[store.engineChip.value.cls, statusChipClass(store.engineChip.value.cls)]">{{ store.engineChip.value.text }}</span>
        <span id="market-chip" class="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-elevated px-2.5 py-1 text-sm text-secondary">{{ store.marketChip.value }}</span>
      </div>
    </template>
    <template #header-actions>
      <IconButton
        class="pbgui-icon-button"
        :icon="PhQuestion"
        :label="t('nav.guide')"
        @click="openStrategyHelp"
      />
    </template>

    <div id="data-tip-tooltip" class="pointer-events-none fixed left-0 top-0 z-[var(--z-help)] hidden max-w-[480px] rounded-[5px] border border-border-strong bg-card px-2.5 py-1.5 text-xs font-normal leading-[1.5] text-primary whitespace-pre-wrap shadow-[var(--shadow-elevated)] [will-change:transform]"></div>
    <div id="page-body" class="flex min-h-0 flex-1 h-[calc(100dvh_-_var(--nav-height))]">
    <div
      class="workbench-page-content flex min-w-0 flex-1 flex-col gap-[var(--component-gap)] overflow-auto overscroll-contain [scrollbar-gutter:stable] p-[var(--page-padding)] bg-page bg-[radial-gradient(circle_at_94%_0%,rgb(var(--accent-rgb)/0.1),transparent_29rem),radial-gradient(circle_at_0%_82%,rgb(var(--success-rgb)/0.05),transparent_24rem),repeating-linear-gradient(135deg,rgb(var(--text-secondary-rgb)/0.016)_0_1px,transparent_1px_42px)]"
      ref="mainContent"
      @scroll.passive="onScroll"
    >
      <section class="page-title sr-only">
        <div>
          <h1 id="strategy-explorer-title">
            {{ adapter.isV8 ? t('v7explore.titleV8', { label: store.strategyLabel.value }) : t('v7explore.titleV7') }}
          </h1>
          <p id="page-subtitle">{{ subtitle }}</p>
        </div>
      </section>

      <MessagesBar :store="store" />
      <AnalysisControls :store="store" />

      <section id="stage-analysis" :class="store.controls.stage === 'analysis' ? 'active block' : 'hidden'">
        <LoadingSkeleton v-if="store.snapshotLoading.value && !store.state.snapshot" :label="t('common.loading')" :lines="6" />
        <div v-else class="relative">
          <div class="grid grid-cols-[repeat(2,minmax(0,1fr))] items-start gap-4 max-[900px]:grid-cols-[1fr]" :class="{ 'pointer-events-none opacity-60': store.snapshotLoading.value }" :aria-busy="store.snapshotLoading.value">
            <SideWorkspace :store="store" side-key="long" />
            <SideWorkspace :store="store" side-key="short" />
          </div>
          <p v-if="store.snapshotLoading.value" role="status" class="absolute top-2 left-1/2 -translate-x-1/2 rounded-md border border-border-default bg-elevated px-3 py-1 text-xs text-secondary shadow-panel">{{ t('common.loading') }}</p>
        </div>
      </section>

      <ExchangeStatePanel v-show="store.controls.stage === 'exchange-state'" :store="store" />
      <RawConfigPanel v-show="store.controls.stage === 'raw'" :store="store" />
      <SimulationPanel :store="store" :simulation="page.simulation" :simulation-modes="page.simulationModes.value" />
      <ComparePanel :store="store" :compare="page.compare" />
      <MoviePanel ref="moviePanel" :store="store" :movie="page.movie" />
      </div>
    </div>
  </AppShell>
</template>

<style>
/* The rules of styles/explorer.css that cannot be Tailwind utilities,
   kept verbatim (merged where the legacy refinement block overrode the
   base block) at the CSS→utilities migration:
   - html/body root rules and the body radial-gradient wash (root rules
     must live in an unscoped block to reach the document root);
   - [data-tip] dotted help underline (attribute selector spanning every
     child component of this page);
   - the .orders table cell/zebra/sticky group (th/td descendants plus
     nth-child striping, shared by SideWorkspace/StatsPanel/ComparePanel/
     MoviePanel — the .opt-table pattern of v7_optimize);
   - the accordion chevron pseudo-element and collapsed-body state
     (pseudo-elements; the class names stay as state anchors);
   - Plotly :fullscreen sizing and the scroll-lock pointer-events rule
     (pseudo-class + descendant selectors into Plotly's own DOM);
   - The range-slider track/thumb pseudo-elements of ParamTuning left with
     the range inputs — ui/Slider renders its own track/fill/thumb.
   Everything else from the stylesheet became utilities in the templates. */
html,
body {
  height: 100%;
  margin: 0;
  color: var(--text);
  background: var(--bg);
  overflow: hidden;
}

body {
  background:
    radial-gradient(circle at 8% 0%, rgb(var(--accent-deep-rgb) / 0.1), transparent 26rem),
    var(--bg);
}

[data-tip] {
  cursor: help;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--text-muted);
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}

.orders {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

.orders th,
.orders td {
  border-bottom: 1px solid var(--border);
  padding: 7px 6px;
  text-align: right;
}

.orders th:first-child,
.orders td:first-child,
.orders th:nth-child(2),
.orders td:nth-child(2) {
  text-align: left;
}

.orders th {
  color: var(--text-dim);
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
}

.orders.compare-grid th,
.orders.compare-grid td {
  border: 1px solid var(--border);
}

.orders.compare-grid tbody tr:nth-child(odd) {
  background: rgb(255 255 255 / 0.018);
}

.orders.compare-grid th {
  position: sticky;
  top: 0;
  background: var(--bg2);
  z-index: 1;
}

.accordion-head::before {
  content: '›';
  transform: rotate(90deg);
  color: var(--text-dim);
}

.accordion-card.collapsed .accordion-head::before {
  transform: rotate(0deg);
}

.accordion-card.collapsed .accordion-body {
  display: none;
}

.workbench-page-content.is-scrolling .js-plotly-plot {
  pointer-events: none;
}

.plot:fullscreen {
  width: 100vw;
  height: 100dvh !important;
  min-height: 100dvh;
  background: var(--bg);
  padding: 8px;
}

.plot:fullscreen > div {
  height: 100% !important;
}

.movie-plot:fullscreen {
  width: 100vw;
  height: 100dvh !important;
  min-height: 100dvh;
  background: var(--bg);
  padding: 8px;
}

.movie-plot:fullscreen > div {
  height: 100% !important;
}

</style>
