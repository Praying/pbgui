import { ref, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import { apiUrl } from '../config';
import { getExchangeMeta } from '../lib/exchange';
import type { ExchangeOption } from '../types';

/*
 * The status-monitor fragment mount protocol (legacy
 * market_data_main.html:4108-4174, 7406-7413, 7813-7816).
 *
 * The status monitor is NOT an iframe: legacy fetched the same-origin
 * fragment /status-monitor/{exchange}, assigned it to the host via
 * innerHTML and re-executed the fragment's inline <script> elements so the
 * fragment boots itself (.mds-root + __MDS_* ids). That innerHTML+re-exec
 * contract is sanctioned as-is (recon R2, test_market_data_status_route.py
 * locks the serving side) and stays until the fragment's own Vue port.
 * Safety rails around it:
 *
 *   - the host div is dedicated to the fragment; Vue never v-html's into it
 *     (the loading/error callouts render as escaped Vue templates instead);
 *   - every remount calls __mdsDestroy on the live .mds-root first
 *     (:4127-4140) so the fragment's timers/WS cannot leak;
 *   - an incrementing requestId drops stale fetches (:4145-4146, :4162,
 *     :4167 — uiState.statusMonitorRequestId, recon R4).
 *
 * Deviation (documented): legacy force-reload appended `&_ts=` to a URL
 * without a query string (:4110-4112), which turned the cache-bust into a
 * literal path segment and 404'd the route (and reloadStatusMonitor had no
 * callers). The port appends `?_ts=` so force-reload actually reloads.
 */

export type MonitorPhase = 'idle' | 'loading' | 'ready' | 'error';

type FetchLike = typeof fetch;

/** The fragment's destroy contract element (:4130-4131). */
type MdsRootElement = HTMLElement & { __mdsDestroy?: () => void };

export interface UseStatusMonitorOptions {
  /** Reads the current context exchange key (uiState.contextExchange). */
  getExchange: () => string;
  fetchImpl?: FetchLike;
  /** Cache-bust clock, injectable for tests. */
  now?: () => number;
}

export interface StatusMonitorController {
  phase: Ref<MonitorPhase>;
  /** Already serverMsg-mapped error detail; empty when not applicable. */
  errorMessage: Ref<string>;
  /** Bind the host element (the #status-monitor-host div owned by StatusPanel). */
  attachHost(host: HTMLElement | null): void;
  /** Legacy updateStatusPanel :7406-7413 — mount only on exchange/root change. */
  updateStatusPanel(): void;
  /** Legacy mountStatusMonitor :4142-4174. */
  mountStatusMonitor(meta: ExchangeOption, forceReload: boolean): Promise<void>;
  /** Legacy reloadStatusMonitor :7813-7816 (force reload of the current exchange). */
  reloadStatusMonitor(): void;
  /** Legacy destroyStatusMonitor :4127-4140. */
  destroyStatusMonitor(): void;
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

/** Legacy executeInlineScripts :4116-4125 — replace each parsed script node
 *  with a fresh element so the browser executes it (innerHTML-created
 *  scripts never run). */
export function executeInlineScripts(container: HTMLElement): void {
  for (const script of Array.from(container.querySelectorAll('script'))) {
    const replacement = document.createElement('script');
    for (const attr of Array.from(script.attributes)) {
      replacement.setAttribute(attr.name, attr.value);
    }
    replacement.text = script.textContent ?? '';
    script.parentNode?.replaceChild(replacement, script);
  }
}

export function useStatusMonitor(options: UseStatusMonitorOptions): StatusMonitorController {
  const doFetch: FetchLike = options.fetchImpl ?? ((...args) => fetch(...args));
  const now = options.now ?? Date.now;

  const phase = ref<MonitorPhase>('idle');
  const errorMessage = ref('');
  let host: HTMLElement | null = null;
  let statusMonitorRequestId = 0; // uiState.statusMonitorRequestId (:3796)

  function attachHost(element: HTMLElement | null): void {
    host = element;
  }

  // Methods dispatch through `controller` so external spies on the public
  // API observe internal calls too (updateStatusPanel → mountStatusMonitor).
  let controller: StatusMonitorController;

  /** Legacy destroyStatusMonitor :4127-4140. */
  function destroyStatusMonitor(): void {
    if (!host) return;
    const root = host.querySelector('.mds-root') as MdsRootElement | null;
    if (root && typeof root.__mdsDestroy === 'function') {
      try {
        root.__mdsDestroy();
      } catch {
        /* legacy swallowed destroy errors (:4132-4136) */
      }
    }
    host.innerHTML = '';
    host.removeAttribute('data-exchange');
  }

  /** Legacy mountStatusMonitor :4142-4174. */
  async function mountStatusMonitor(meta: ExchangeOption, forceReload: boolean): Promise<void> {
    if (!host) return; // :7143-7144
    statusMonitorRequestId += 1;
    const requestId = statusMonitorRequestId;

    destroyStatusMonitor(); // :4148 — destroy contract before remount (R2)
    host.dataset.exchange = meta.statusKey; // :4149
    phase.value = 'loading';
    errorMessage.value = '';

    try {
      const response = await doFetch(buildStatusMonitorUrl(meta, forceReload, now), {
        cache: 'no-store', // :4157
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`); // :4158-4160
      const html = await response.text();
      if (statusMonitorRequestId !== requestId) return; // :4162 stale guard (R4)
      host.innerHTML = html; // :4163 — sanctioned fragment contract (R2)
      host.dataset.exchange = meta.statusKey; // :4164
      executeInlineScripts(host); // :4165
      phase.value = 'ready';
    } catch (error) {
      if (statusMonitorRequestId !== requestId) return; // :4167 stale guard
      phase.value = 'error';
      const message = error instanceof Error && error.message ? error.message : '';
      errorMessage.value = serverMsg(message); // :4171 — empty falls back in the panel
    }
  }

  /** Legacy updateStatusPanel :7406-7413 — mount only when the host does not
   *  already show this exchange's live fragment. */
  function updateStatusPanel(): void {
    const meta = getExchangeMeta(options.getExchange());
    if (!host) return; // :7408-7409
    if (host.dataset.exchange !== meta.statusKey || !host.querySelector('.mds-root')) {
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
    attachHost,
    updateStatusPanel,
    mountStatusMonitor,
    reloadStatusMonitor,
    destroyStatusMonitor,
  };

  return controller;
}
