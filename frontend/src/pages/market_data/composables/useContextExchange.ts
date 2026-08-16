import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { getExchangeMeta } from '../lib/exchange';
import type { ExchangeOption } from '../types';
import type { PanelId } from '../types';

/*
 * Exchange context — the page's pivot (legacy market_data_main.html).
 *
 *   setContextExchange      :7304-7333   normalize → persist → fan-out
 *   restore                 :9766-9771   read raw stored value, then fan out
 *   sidebar shortcuts       :7415-7446   l2books visibility + active states
 *   openBest1mPanel section :7687-7691   uiState.best1mPanelSection normalize
 *
 * The panel-specific fan-out branches are injected hooks: loadSettings
 * belongs to M-data-3, the inventory pair to M-data-6, the best-1m refresh
 * to M-data-7 and the integrity reset to M-data-5. Legacy gated the last
 * three on the panel's .active-panel class; here isPanelActive provides
 * that check against the panel router state.
 */

/** Legacy uiState.best1mPanelSection vocabulary (:7433). */
export type Best1mSection = 'build' | 'download';

/** Per-branch fan-out hooks, each annotated with its owning migration task. */
export interface ExchangeFanoutHooks {
  /** loadSettings(exchangeKey, {keepFeedback:false}) :7314 — M-data-3. */
  loadSettings?(exchangeKey: string): void;
  /** updateStatusPanel() :7315 — M-data-2 (useStatusMonitor.updateStatusPanel). */
  updateStatusPanel?(meta: ExchangeOption): void;
  /** syncInventorySubsectionVisibility() :7317 — M-data-6. */
  syncInventorySubsectionVisibility?(): void;
  /** loadInventoryPanel(true) :7318-7320 — M-data-6, only while the panel is active. */
  loadInventoryPanel?(forceReload: boolean): void;
  /** refreshBest1mPanel(false) :7321-7323 — M-data-7, only while the panel is active. */
  refreshBest1mPanel?(forceReload: boolean): void;
  /** Integrity branch :7324-7332 — M-data-5: reset state, re-render, reload. */
  onIntegrityExchangeChange?(statusKey: string): void;
}

export interface UseContextExchangeOptions {
  storage?: Storage;
  /** Raw restored value (:9766) — normalized by the first setContextExchange (:9771). */
  initialExchange: string;
  /** Legacy `document.getElementById(id).classList.contains('active-panel')`. */
  isPanelActive: (panel: PanelId) => boolean;
  hooks?: ExchangeFanoutHooks;
}

export interface UseContextExchange {
  /** Normalized exchange key (uiState.contextExchange — legacy stores meta.key). */
  contextExchange: Ref<string>;
  /** The meta of the current context exchange. */
  contextMeta: ComputedRef<ExchangeOption>;
  /** l2books sidebar shortcut visibility (:7422 — hyperliquid only). */
  showL2booksShortcut: ComputedRef<boolean>;
  /** Current best-1m section (uiState.best1mPanelSection, default build). */
  best1mSection: Ref<Best1mSection>;
  /** Full legacy fan-out (:7304-7333). */
  setContextExchange(exchange: unknown): void;
  /** Section normalizer of openBest1mPanel (:7688) without the panel switch. */
  setBest1mSection(section: unknown): Best1mSection;
}

export function useContextExchange(options: UseContextExchangeOptions): UseContextExchange {
  const storage = options.storage ?? window.localStorage;
  const hooks = options.hooks ?? {};
  const contextExchange = ref(options.initialExchange);
  const best1mSection = ref<Best1mSection>('build');

  const contextMeta = computed(() => getExchangeMeta(contextExchange.value));
  const showL2booksShortcut = computed(() => contextMeta.value.key === 'hyperliquid');

  /** openBest1mPanel section normalize (:7688): 'download' or anything else → build. */
  function setBest1mSection(section: unknown): Best1mSection {
    best1mSection.value = section === 'download' ? 'download' : 'build';
    return best1mSection.value;
  }

  function setContextExchange(exchange: unknown): void {
    const meta = getExchangeMeta(exchange);
    contextExchange.value = meta.key; // :7306 (+ select sync via v-model :7307-7308)
    try {
      storage.setItem('market_data_fastapi_context_exchange', meta.key); // :7309-7313
    } catch {
      /* legacy swallowed storage failures */
    }
    hooks.loadSettings?.(meta.key); // :7314 (M-data-3)
    hooks.updateStatusPanel?.(meta); // :7315
    hooks.syncInventorySubsectionVisibility?.(); // :7317 (M-data-6)
    if (options.isPanelActive('inventory-panel')) hooks.loadInventoryPanel?.(true); // :7318-7320
    if (options.isPanelActive('best1m-panel')) hooks.refreshBest1mPanel?.(false); // :7321-7323
    if (options.isPanelActive('integrity-panel')) hooks.onIntegrityExchangeChange?.(meta.statusKey); // :7324-7332
  }

  return {
    contextExchange,
    contextMeta,
    showL2booksShortcut,
    best1mSection,
    setContextExchange,
    setBest1mSection,
  };
}

/**
 * Legacy syncSidebarShortcutState (:7427-7446): the two best-1m shortcut
 * links highlight depending on the open panel, the context exchange and
 * the active best-1m section. Pure — the sidebar consumes it from props.
 */
export function computeSidebarShortcutState(
  activePanel: PanelId,
  exchangeKey: string,
  section: Best1mSection
): { best1mActive: boolean; l2booksActive: boolean } {
  const isBest1mPanelActive = activePanel === 'best1m-panel';
  const isHyperliquid = exchangeKey === 'hyperliquid';
  const activeSection: Best1mSection = section === 'download' ? 'download' : 'build';
  return {
    best1mActive: isBest1mPanelActive && (!isHyperliquid || activeSection === 'build'),
    l2booksActive: isBest1mPanelActive && isHyperliquid && activeSection === 'download',
  };
}
