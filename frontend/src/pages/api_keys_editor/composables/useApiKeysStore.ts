import { computed, ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import { pageFetch } from '../lib/pageApi';
import { userExpirySortValue } from '../lib/expiry';
import { injectToasts } from './useToasts';
import type {
  ApiMeta,
  BybitExpiryInfo,
  ExchangeCatalog,
  HlExpiryInfo,
  Translator,
  UserSummary,
} from '../types';

/**
 * User-list store: loadUsers/loadExchanges/loadApiMeta, filter+sort with
 * ?filter&sort&dir URL persistence, and the live expiry caches shared by the
 * table, the edit panel and the expiry panels (legacy :1098-1491).
 */

export type SortColumn = '' | 'name' | 'exchange' | 'hl_expiry' | 'status';

export function useApiKeysStore(t: Translator, toasts: ReturnType<typeof injectToasts>) {
  const users = ref<UserSummary[]>([]);
  const usersState = ref<'loading' | 'ready' | 'error'>('loading');
  const usersError = ref('');
  const exchanges = ref<string[]>([]);
  const passphraseExchanges = ref<string[]>([]);
  const meta = ref<ApiMeta | null>(null);
  const hlExpiryData = ref<Record<string, HlExpiryInfo>>({});
  const bybitExpiryData = ref<Record<string, BybitExpiryInfo>>({});
  const filterText = ref('');
  const sortCol = ref<SortColumn>('');
  const sortDir = ref(1);

  const inUseCount = computed(() => users.value.filter((u) => u.in_use).length);

  async function loadExchanges(): Promise<void> {
    try {
      const data = await pageFetch<ExchangeCatalog>('/exchanges');
      exchanges.value = data.exchanges || [];
      passphraseExchanges.value = data.passphrase_exchanges || [];
    } catch (e) {
      toasts.showToast(t('misc.apikeys.failedToLoadExchanges', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
    }
  }

  async function loadApiMeta(): Promise<void> {
    try {
      meta.value = await pageFetch<ApiMeta>('/meta');
    } catch {
      /* non-critical — ignore (legacy :1279) */
    }
  }

  async function loadUsers(): Promise<void> {
    usersState.value = 'loading';
    try {
      users.value = await pageFetch<UserSummary[]>('/');
      usersState.value = 'ready';
      void loadApiMeta();
    } catch (e) {
      usersState.value = 'error';
      usersError.value = serverMsg(e instanceof Error ? e.message : '');
    }
  }

  /* ── filter + sort with URL persistence (:1115-1137) ── */

  function updateUrlParams(): void {
    const params = new URLSearchParams(location.search);
    if (filterText.value) params.set('filter', filterText.value);
    else params.delete('filter');
    if (sortCol.value) {
      params.set('sort', sortCol.value);
      params.set('dir', String(sortDir.value));
    } else {
      params.delete('sort');
      params.delete('dir');
    }
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  function restoreUrlParams(): void {
    const params = new URLSearchParams(location.search);
    const f = params.get('filter');
    if (f) filterText.value = f;
    const s = params.get('sort');
    if (s) {
      sortCol.value = (['name', 'exchange', 'hl_expiry', 'status'].includes(s) ? s : '') as SortColumn;
      sortDir.value = parseInt(params.get('dir') || '1') || 1;
    }
  }

  function setSort(col: Exclude<SortColumn, ''>): void {
    if (sortCol.value === col) sortDir.value = -sortDir.value;
    else {
      sortCol.value = col;
      sortDir.value = 1;
    }
    updateUrlParams();
  }

  function setFilter(text: string): void {
    filterText.value = text;
    updateUrlParams();
  }

  function clearFilter(): void {
    filterText.value = '';
    updateUrlParams();
  }

  /** Credentials summary per exchange type lives in UserListTable (:1370-1380). */

  const filteredSortedUsers = computed<UserSummary[]>(() => {
    const q = filterText.value.trim().toLowerCase();
    let list = q
      ? users.value.filter(
          (u) => (u.name || '').toLowerCase().includes(q) || (u.exchange || '').toLowerCase().includes(q)
        )
      : [...users.value];
    if (sortCol.value) {
      const col = sortCol.value;
      const dir = sortDir.value;
      list = list.sort((a, b) => {
        let va: string | number;
        let vb: string | number;
        if (col === 'name') {
          va = (a.name || '').toLowerCase();
          vb = (b.name || '').toLowerCase();
        } else if (col === 'exchange') {
          va = (a.exchange || '').toLowerCase();
          vb = (b.exchange || '').toLowerCase();
        } else if (col === 'status') {
          va = a.in_use ? 0 : 1;
          vb = b.in_use ? 0 : 1;
        } else {
          va = userExpirySortValue(a, hlExpiryData.value, bybitExpiryData.value);
          vb = userExpirySortValue(b, hlExpiryData.value, bybitExpiryData.value);
        }
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }
    return list;
  });

  /** Drop cached expiry data for one user after a credential change (:1931-1935). */
  function clearExpiryFor(name: string): void {
    const { [name]: _hl, ...hlRest } = hlExpiryData.value;
    const { [name]: _bb, ...bbRest } = bybitExpiryData.value;
    hlExpiryData.value = hlRest;
    bybitExpiryData.value = bbRest;
  }

  function replaceHlExpiry(map: Record<string, HlExpiryInfo>): void {
    hlExpiryData.value = map;
  }

  function replaceBybitExpiry(map: Record<string, BybitExpiryInfo>): void {
    bybitExpiryData.value = map;
  }

  return {
    users,
    usersState,
    usersError,
    exchanges,
    passphraseExchanges,
    meta,
    hlExpiryData,
    bybitExpiryData,
    filterText,
    sortCol,
    sortDir,
    inUseCount,
    filteredSortedUsers,
    loadExchanges,
    loadUsers,
    loadApiMeta,
    restoreUrlParams,
    setSort,
    setFilter,
    clearFilter,
    clearExpiryFor,
    replaceHlExpiry,
    replaceBybitExpiry,
  };
}

export type ApiKeysStore = ReturnType<typeof useApiKeysStore>;
