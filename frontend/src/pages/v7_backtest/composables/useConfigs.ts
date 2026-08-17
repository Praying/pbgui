import { ref } from 'vue';
import type { ConfigSummary } from '../types';

/**
 * Configs data layer (loadConfigs :1647-1652). The list/editor UI is
 * M-v7-9; this store exists so panel lazy-loads (:1452) and the WS
 * just-completed reload (:1289) have a real target.
 */

export interface ConfigsStoreOptions {
  apiBase: string;
  fetchFn?: typeof fetch;
  onError?(message: string): void;
}

export function useConfigs(options: ConfigsStoreOptions) {
  const fetchFn = options.fetchFn ?? fetch;
  const configs = ref<ConfigSummary[]>([]);
  const loadedOnce = ref(false);
  let flight: Promise<void> | null = null;

  async function loadConfigs(): Promise<void> {
    if (flight) return flight;
    flight = (async () => {
      try {
        const resp = await fetchFn(options.apiBase + '/configs', { credentials: 'same-origin' });
        const data: unknown = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const body = data as { detail?: unknown };
          throw new Error(typeof body.detail === 'string' ? body.detail : resp.statusText);
        }
        const list = (data as { configs?: unknown }).configs;
        configs.value = Array.isArray(list) ? (list as ConfigSummary[]) : [];
        loadedOnce.value = true;
      } catch (error) {
        options.onError?.(error instanceof Error ? error.message : String(error));
      } finally {
        flight = null;
      }
    })();
    return flight;
  }

  /** Panel-switch lazy-load (:1452): only fetch while the list is empty. */
  async function loadIfEmpty(): Promise<void> {
    if (configs.value.length === 0) await loadConfigs();
  }

  return { configs, loadedOnce, loadConfigs, loadIfEmpty };
}
