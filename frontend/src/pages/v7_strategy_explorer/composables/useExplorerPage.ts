import { ref } from 'vue';
import { useStrategyExplorer, type ExplorerStore } from './useStrategyExplorer';
import { useSession } from './useSession';
import { useSimulation } from './useSimulation';
import { useCompare } from './useCompare';
import { useMovie } from './useMovie';
import type { PageConfig } from '../types';
import type { Translate } from './useStrategyExplorer';

export interface PageDeps {
  t: Translate;
  adapterParams: {
    adapter: import('../config').ExplorerAdapter;
    apiBase: string;
    draftId: string;
    resultPath: string;
  };
}

/**
 * Page-level wiring: the store plus the four flows, and configureVersionUi
 * (:479-546) — the flavour-dependent title/subtitle/simulation-mode setup.
 */
export function useExplorerPage(deps: PageDeps) {
  const { t } = deps;
  const store: ExplorerStore = useStrategyExplorer({ ...deps.adapterParams, t });

  /** Simulation-mode buttons (:483-502) — page.simulation_modes or flavour defaults. */
  const simulationModes = ref(
    store.adapter.defaultSimulationModes.map((mode) => ({ key: mode.key, labelKey: mode.labelKey, label: t(mode.labelKey) }))
  );

  const movieStatus = ref('');

  const simulation = useSimulation(store);
  const compare = useCompare(store);
  const movie = useMovie(store, t);

  /** configureVersionUi (:504-546) — no DOM writes; components read state. */
  function configureVersionUi(page: PageConfig): void {
    page = page || {};
    if (store.adapter.isV8) store.strategyLabel.value = String(page.strategy_label || 'PB8');
    document.title = t(store.adapter.pageTitleKey);
    const modes = Array.isArray(page?.simulation_modes)
      ? page.simulation_modes.filter((mode) => mode && mode.key)
      : [];
    if (!modes.length) {
      simulationModes.value = store.adapter.defaultSimulationModes.map((mode) => ({ key: mode.key, labelKey: mode.labelKey, label: t(mode.labelKey) }));
    } else {
      simulationModes.value = modes.map((mode) => ({ key: String(mode.key), labelKey: '', label: String(mode.label || mode.key) }));
    }
    if (store.adapter.isV8) simulationModes.value = simulationModes.value.slice(0, 1);
    store.state.activeSimulationMode = String(simulationModes.value[0]?.key ?? 'pb8_engine');
    if (store.adapter.isV8) {
      // v8 UI collapse (configureVersionUi :514-541) is declarative in the
      // components via adapter.isV8; the engine/side selects reset here.
      store.controls.movieEngine = 'pb8_engine';
      store.controls.simStartState = 'flat';
    }
  }

  const session = useSession(store, {
    configureVersionUi,
    applyMovieResult: (data) => {
      try {
        movie.applyMovieResult(data);
      } catch {
        /* cached movie may be !ok — the legacy render-then-throw path */
      }
    },
    buildMovieFrames: () => void movie.buildMovieFrames(),
    syncLastMovieOptionsKey: () => {
      movie.lastMovieOptionsKey.value = store.movieFrameOptionsKey(store.selectedMovieFrameOptions(''));
    },
    movieStatus,
  });

  return { store, simulationModes, movieStatus, simulation, compare, movie, session, configureVersionUi };
}

export type ExplorerPage = ReturnType<typeof useExplorerPage>;
