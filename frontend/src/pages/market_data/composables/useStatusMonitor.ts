import { ref, type Ref } from 'vue';
import { apiUrl } from '../config';
import { getExchangeMeta } from '../lib/exchange';
import type { ExchangeOption } from '../types';

/*
 * The status-monitor mount protocol (legacy market_data_main.html:4108-4174,
 * 7406-7413, 7813-7816), M-data-8 fragment retirement.
 *
 * Until M-data-8 the status monitor was NOT an iframe: legacy (and the Vue
 * port through M-data-7) fetched the same-origin URL, assigned the response
 * to the host via innerHTML and re-executed the inline <script> elements so
 * the fragment booted itself (.mds-root + __MDS_* ids). That contract is
 * bound to inline CLASSIC scripts: the retired fragment's replacement is the
 * built market_data_status Vue page — an ES-module document, and module
 * scripts evaluate only once per document, so re-injecting it on every
 * exchange switch would leave every remount after the first blank (the route
 * flip's retirement guard, api/market_data.py
 * _serve_market_data_status_page). The panel therefore embeds the built page
 * as a same-origin iframe, mirroring the jobs_monitor/hl_data_actions embeds
 * of this very page:
 *
 *   - the iframe src alone carries the exchange (the route injects
 *     data-exchange into the served document; the embedded page also falls
 *     back to the ?exchange= query and the status-monitor path segment);
 *   - unloading the frame discards its timers/WS — the __mdsDestroy
 *     contract (:4130-4131) now lives INSIDE the frame page, so the parent
 *     only resets its own bookkeeping on destroy;
 *   - the frame 'load'/'error' events drive the phase; a stray re-fire of
 *     load is ignored once a newer mount has already landed (phase-gated —
 *     the legacy requestId guard's purpose, recon R4).
 *
 * Deviation kept from M-data-2 (documented): legacy force-reload appended
 * `&_ts=` to a URL without a query string (:4110-4112), which turned the
 * cache-bust into a literal path segment and 404'd the route (and
 * reloadStatusMonitor had no callers). The port appends `?_ts=` so
 * force-reload actually reloads.
 */

export type MonitorPhase = 'idle' | 'loading' | 'ready' | 'error';

/** Structural slice of the iframe element the controller owns. */
export type StatusFrameElement = HTMLIFrameElement;

export interface UseStatusMonitorOptions {
  /** Reads the current context exchange key (uiState.contextExchange). */
  getExchange: () => string;
  /** Cache-bust clock, injectable for tests. */
  now?: () => number;
}

export interface StatusMonitorController {
  phase: Ref<MonitorPhase>;
  /** Empty when not applicable — StatusPanel renders the fallback message. */
  errorMessage: Ref<string>;
  /** Bind the monitor iframe element (owned by StatusPanel). */
  attachFrame(frame: StatusFrameElement | null): void;
  /** Legacy updateStatusPanel :7406-7413 — mount only on exchange change. */
  updateStatusPanel(): void;
  /** Legacy mountStatusMonitor :4142-4174 — point the frame at the exchange. */
  mountStatusMonitor(meta: ExchangeOption, forceReload: boolean): Promise<void>;
  /** Legacy reloadStatusMonitor :7813-7816 (force reload of the current exchange). */
  reloadStatusMonitor(): void;
  /** Legacy destroyStatusMonitor :4127-4140 — reset the mount bookkeeping. */
  destroyStatusMonitor(): void;
  /** Frame load event — StatusPanel binds it (@load) for the phase machine. */
  handleFrameLoad(): void;
  /** Frame error event — network-level navigation failures. */
  handleFrameError(): void;
}

/** Legacy buildStatusMonitorUrl :4108-4114 (with the `?_ts=` correction). */
export function buildStatusMonitorUrl(
  meta: ExchangeOption,
  forceReload: boolean,
  now: () => number = Date.now
): string {
  const url = apiUrl(`/status-monitor/${encodeURIComponent(meta.statusKey)}`);
  return forceReload ? `${url}?_ts=${now()}` : url;
}

export function useStatusMonitor(options: UseStatusMonitorOptions): StatusMonitorController {
  const now = options.now ?? Date.now;

  const phase = ref<MonitorPhase>('idle');
  const errorMessage = ref('');
  let frame: StatusFrameElement | null = null;
  /** statusKey currently pointed at by the frame (uiState bookkeeping :4149). */
  let mountedKey = '';

  function attachFrame(element: StatusFrameElement | null): void {
    frame = element;
    if (!element) mountedKey = '';
  }

  // Methods dispatch through `controller` so external spies on the public
  // API observe internal calls too (updateStatusPanel → mountStatusMonitor).
  let controller: StatusMonitorController;

  /** Legacy destroyStatusMonitor :4127-4140. The frame document (its timers
   *  and WebSocket) is discarded together with the element; the controller
   *  resets only its own mount bookkeeping so the next updateStatusPanel
   *  remounts. */
  function destroyStatusMonitor(): void {
    mountedKey = '';
    phase.value = 'idle';
    errorMessage.value = '';
    frame?.removeAttribute('data-exchange');
  }

  /** Legacy mountStatusMonitor :4142-4174. Swapping the src cancels any
   *  in-flight navigation of the previous exchange — no async fetch means no
   *  stale-response race (recon R4's requestId guard becomes phase-gating). */
  function mountStatusMonitor(meta: ExchangeOption, forceReload: boolean): Promise<void> {
    mountedKey = meta.statusKey;
    phase.value = 'loading';
    errorMessage.value = '';
    frame?.setAttribute('data-exchange', meta.statusKey); // :4149
    if (frame) frame.src = buildStatusMonitorUrl(meta, forceReload, now);
    return Promise.resolve();
  }

  function handleFrameLoad(): void {
    if (phase.value === 'loading') phase.value = 'ready';
  }

  function handleFrameError(): void {
    if (phase.value === 'loading') {
      phase.value = 'error';
      errorMessage.value = ''; // the panel renders the generic failure message
    }
  }

  /** Legacy updateStatusPanel :7406-7413 — mount only when the frame is not
   *  already showing this exchange's live document. */
  function updateStatusPanel(): void {
    const meta = getExchangeMeta(options.getExchange());
    if (!frame) return; // :7408-7409
    if (mountedKey !== meta.statusKey) {
      void controller.mountStatusMonitor(meta, false);
    }
  }

  /** Legacy reloadStatusMonitor :7813-7816. */
  function reloadStatusMonitor(): void {
    void controller.mountStatusMonitor(getExchangeMeta(options.getExchange()), true);
  }

  controller = {
    phase,
    errorMessage,
    attachFrame,
    updateStatusPanel,
    mountStatusMonitor,
    reloadStatusMonitor,
    destroyStatusMonitor,
    handleFrameLoad,
    handleFrameError,
  };

  return controller;
}
