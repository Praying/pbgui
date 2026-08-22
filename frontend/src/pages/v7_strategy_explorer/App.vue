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
 * │ RawConfigPanel         │ syncRawFromState/bindRawConfigEditor         │
 * │                        │ :1702-1765 (window.PBGuiJsonPanel global)    │
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
import AppShell from '@/shared/components/AppShell.vue';
import IconButton from '@/shared/components/IconButton.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
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

const subtitle = computed(() => t(adapter.subtitleKey));
const moviePanel = useTemplateRef<{ stepMovieFrame(direction: number): boolean }>('moviePanel');

function openStrategyHelp(): void {
  const sharedHelp = (window as Window & {
    PBGuiSharedHelp?: { open?: (topic: string) => void };
  }).PBGuiSharedHelp;
  sharedHelp?.open?.('00_strategy_explorer_help');
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
});
</script>

<template>
  <MigrationWatermark />
  <AppShell
    class="core-workbench-shell core-workbench-shell--strategy"
    :page-key="adapter.navCurrent"
    :page-title="adapter.isV8 ? t('v7explore.titleV8', { label: store.strategyLabel.value }) : t('v7explore.titleV7')"
    :page-description="subtitle"
    :page-family="adapter.isV8 ? 'PBv8' : 'PBv7'"
  >
    <template #status>
      <div class="toolbar">
        <span id="source-chip" class="sr-only" :class="store.sourceChip.value.cls" :title="store.sourceChip.value.title">{{ store.sourceChip.value.text }}</span>
        <StatusStrip
          :label="t('v7explore.source')"
          :value="store.sourceChip.value.text"
          :tone="store.sourceChip.value.cls.includes('err') ? 'danger' : store.sourceChip.value.cls.includes('warn') ? 'warning' : store.sourceChip.value.cls.includes('ok') ? 'success' : 'neutral'"
        />
        <span id="ohlcv-chip" :class="store.ohlcvChip.value.cls" :title="store.ohlcvChip.value.title">OHLCV: {{ store.ohlcvChip.value.text }}</span>
        <span id="engine-chip" :class="store.engineChip.value.cls">{{ store.engineChip.value.text }}</span>
        <span id="market-chip" class="chip">{{ store.marketChip.value }}</span>
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

    <div id="data-tip-tooltip"></div>
    <div id="page-body">
    <aside id="sidebar">
      <div id="sidebar-inner">
        <button
          v-for="stage in STAGES"
          :key="stage.key"
          class="sb-section"
          :class="{ active: store.controls.stage === stage.key }"
          @click="selectStage(stage.key)"
        >
          {{ t(stage.labelKey) }}
        </button>
      </div>
      <div id="sidebar-resize"></div>
    </aside>

    <div class="workbench-page-content" ref="mainContent" @scroll.passive="onScroll">
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

      <section id="stage-analysis" class="stage-view" :class="{ active: store.controls.stage === 'analysis' }">
        <div class="main-layout">
          <SideWorkspace :store="store" side-key="long" />
          <SideWorkspace :store="store" side-key="short" />
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
