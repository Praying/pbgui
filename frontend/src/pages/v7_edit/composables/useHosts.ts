import { ref, type Ref } from 'vue';
import type { EditAdapter } from '../config';

/**
 * Host capability refresh — ports of requestHostCapabilities
 * (v7_edit.html:1910-1928: generation counter, AbortController, request-id
 * echo check), refreshHostCapabilities (:1930-1951), populateHosts
 * (:1953-1969) and updateEnabledOnAvailability (:1971-1985).
 */

type FetchFn = typeof fetch;

export interface HostCapabilityPayload {
  readonly request_id: string;
  readonly hosts?: string[];
  readonly host_capabilities?: Record<string, Record<string, unknown>>;
}

/** ?request_id=…&name=… (name only for v8, :1914-1918). */
export function buildHostQuery(requestId: string, opts: { isV8: boolean; instanceName: string; configSchema?: string }): string {
  let query = '?request_id=' + encodeURIComponent(requestId);
  if (opts.isV8 && opts.instanceName) query += '&name=' + encodeURIComponent(opts.instanceName);
  if (opts.isV8 && opts.configSchema) query += '&config_schema=' + encodeURIComponent(opts.configSchema);
  return query;
}

function newRequestId(generation: number): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'host-capability-' + Date.now() + '-' + generation;
}

export async function requestHostCapabilities(
  apiBase: string,
  requestId: string,
  opts: { isV8: boolean; instanceName: string; configSchema?: string; signal?: AbortSignal },
  fetchFn: FetchFn = fetch
): Promise<HostCapabilityPayload> {
  const response = await fetchFn(apiBase + '/hosts' + buildHostQuery(requestId, opts), {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Host capability refresh failed: HTTP ' + response.status);
  const payload = (await response.json()) as HostCapabilityPayload;
  if (String(payload.request_id ?? '') !== requestId) {
    throw new Error('Host capability response request ID mismatch');
  }
  return payload;
}

export interface HostGate {
  isDisabled(host: string, capabilities: Record<string, Record<string, unknown>>): boolean;
  label(host: string, capabilities: Record<string, Record<string, unknown>>): string;
}

/** updateEnabledOnAvailability (:1971-1985) as a pure gate. */
export function createHostGate(
  adapter: EditAdapter,
  formatSuffix = (label: string) => `${label} capability unconfirmed`
): HostGate {
  const isDisabled = (host: string, capabilities: Record<string, Record<string, unknown>>): boolean => {
    if (host === 'disabled') return false;
    const capability = capabilities[host] ?? null;
    return !capability || capability[adapter.capabilityKey] !== true;
  };
  return {
    isDisabled,
    label(host, capabilities) {
      if (!isDisabled(host, capabilities)) return host;
      return `${host} (${formatSuffix(adapter.label)})`;
    },
  };
}

/** refreshHostCapabilities list merge (:1937-1941) — payload list replaces, missing selection re-appended. */
export function mergeHostList(current: string[], payloadHosts: string[] | undefined, selected: string): string[] {
  const next = payloadHosts === undefined ? current.slice() : payloadHosts.slice();
  if (selected && selected !== 'disabled' && !next.includes(selected)) next.push(selected);
  return next;
}

/** populateHosts render (:1956-1967) — 'disabled' always first, deduped. */
export function hostOptions(allHosts: readonly string[]): string[] {
  const seen = new Set<string>(['disabled']);
  const options = ['disabled'];
  for (const host of allHosts) {
    if (host === 'disabled' || seen.has(host)) continue;
    seen.add(host);
    options.push(host);
  }
  return options;
}

export interface UseHosts {
  readonly allHosts: Ref<string[]>;
  readonly capabilities: Ref<Record<string, Record<string, unknown>>>;
  readonly selected: Ref<string>;
  readonly gate: HostGate;
  refresh(): Promise<void>;
  dispose(): void;
}

/**
 * The composable wrapper: one in-flight capability request at a time, a
 * generation counter so a superseded refresh cannot clobber state, and the
 * abort-controller cleanup the legacy page leaked.
 */
export function useHosts(
  apiBase: string,
  adapter: EditAdapter,
  instanceName: string,
  fetchFn: FetchFn = fetch,
  schemaSource: Ref<string> | (() => string) = ref('')
): UseHosts {
  const configSchema = schemaSource;
  const allHosts = ref<string[]>(['disabled']);
  const capabilities = ref<Record<string, Record<string, unknown>>>({});
  const selected = ref('');
  let generation = 0;
  let controller: AbortController | null = null;

  async function refresh(): Promise<void> {
    const requestGeneration = ++generation;
    controller?.abort();
    controller = new AbortController();
    const selectedBefore = selected.value;
    try {
      const payload = await requestHostCapabilities(
        apiBase,
        newRequestId(requestGeneration),
        {
          isV8: adapter.isV8,
          instanceName,
          configSchema: typeof configSchema === 'function' ? configSchema() : configSchema.value,
          signal: controller.signal,
        },
        fetchFn
      );
      if (requestGeneration !== generation) return; // superseded (:1925)
      const currentSelection = selected.value;
      const keepSelected = currentSelection && currentSelection !== selectedBefore ? currentSelection : selectedBefore;
      capabilities.value = payload.host_capabilities ?? {};
      const selectedCapability = keepSelected ? capabilities.value[keepSelected] : undefined;
      const schemaIncompatible = adapter.isV8 && selectedCapability?.pb8_capable === true && selectedCapability.schema_compatible === false;
      allHosts.value = mergeHostList(allHosts.value, payload.hosts, schemaIncompatible ? '' : keepSelected);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // legacy only warned (:1949) — keep the last good list
    }
  }

  return {
    allHosts,
    capabilities,
    selected,
    gate: createHostGate(adapter),
    refresh,
    dispose() {
      controller?.abort();
      controller = null;
    },
  };
}
