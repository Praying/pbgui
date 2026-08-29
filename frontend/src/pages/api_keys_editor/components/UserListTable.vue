<script setup lang="ts">
/*
 * User list table (:673-707 markup, render :1309-1491): API-keys meta bar,
 * filter box, sortable columns with keyboard row navigation, credentials and
 * expiry badges, in-use state and row actions.
 */
import { computed } from 'vue';
import { PhCaretDown, PhCaretUp, PhKey, PhMagnifyingGlass, PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import ExpiryBadge from './ExpiryBadge.vue';
import type { ApiKeysStore } from '../composables/useApiKeysStore';
import type { BybitExpiryInfo, HlExpiryInfo, UserSummary } from '../types';

const props = defineProps<{ store: ApiKeysStore }>();

const emit = defineEmits<{ (e: 'edit', name: string): void; (e: 'delete', name: string): void }>();

const { t } = useI18n();

const store = props.store;

const metaTsText = computed(() => {
  const ts = store.meta.value?.api_ts;
  if (!ts) return '';
  const d = new Date(ts);
  return '/ ' + d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
});

const metaByText = computed(() => {
  const by = store.meta.value?.api_by;
  return by ? t('misc.apikeys.byPrefix', { name: by }) : '';
});

/** Exchange badges use one accent treatment so the table keeps one visual focus. */
function exchangeClass(_exchange: string | undefined): string {
  return 'border border-accent/25 bg-accent/8 text-accent-soft';
}

/** Credentials summary per exchange type (:1370-1380). */
function credsFor(u: UserSummary): string[] {
  const creds: string[] = [];
  if (u.exchange === 'hyperliquid') {
    if (u.has_wallet) creds.push('wallet');
    if (u.has_private_key) creds.push('key');
    if (u.is_vault) creds.push('vault');
  } else {
    if (u.has_key) creds.push('key');
    if (u.has_secret) creds.push('secret');
  }
  return creds;
}

/** Expiry shown in the table: live data first, stored fallback (:1382-1406). */
function expiryFor(u: UserSummary): HlExpiryInfo | BybitExpiryInfo | null {
  if (u.exchange === 'hyperliquid') {
    const live = store.hlExpiryData.value[u.name];
    if (live) return live;
    if (u.hl_expiry_status) {
      return {
        name: u.name,
        status: u.hl_expiry_status as HlExpiryInfo['status'],
        days_remaining: u.hl_days_remaining ?? null,
        valid_until_iso: u.hl_valid_until_iso ?? null,
        error: null,
      };
    }
    return null;
  }
  if (u.exchange === 'bybit') {
    const live = store.bybitExpiryData.value[u.name];
    if (live) return live;
    if (u.bybit_expiry_status) {
      return {
        name: u.name,
        status: u.bybit_expiry_status as BybitExpiryInfo['status'],
        days_remaining: u.bybit_days_remaining ?? null,
        expires_at_iso: u.bybit_expires_at_iso ?? null,
        ips: null,
        error: null,
      };
    }
  }
  return null;
}

function sortClass(col: string): string[] {
  if (store.sortCol.value !== col) return [];
  return [store.sortDir.value === 1 ? 'sort-asc' : 'sort-desc'];
}

function sortAriaValue(col: string): 'ascending' | 'descending' | 'none' {
  if (store.sortCol.value !== col) return 'none';
  return store.sortDir.value === 1 ? 'ascending' : 'descending';
}

function clearFilterAndFocus(): void {
  store.clearFilter();
  document.getElementById('userFilter')?.focus();
}

function onFilterKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown') return;
  event.preventDefault();
  const row = document.querySelector('#userTableBody tr[tabindex]');
  (row as HTMLElement | null)?.focus();
}

/** Row keyboard navigation (:1454-1473). */
function onRowKeydown(event: KeyboardEvent, name: string): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('edit', name);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    const target = event.target as HTMLElement;
    const next = target.nextElementSibling as HTMLElement | null;
    if (next && next.hasAttribute('tabindex')) next.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    const target = event.target as HTMLElement;
    const prev = target.previousElementSibling as HTMLElement | null;
    if (prev && prev.hasAttribute('tabindex')) {
      prev.focus();
    } else {
      document.getElementById('userFilter')?.focus();
    }
  }
}
</script>

<template>
  <div id="userListView" class="mx-auto w-[min(100%,1500px)]">
    <!-- API keys metadata bar -->
    <div
      id="apiMetaBar"
      class="api-meta-bar mb-4 flex min-h-[42px] items-center justify-between gap-3 rounded-md border border-border-subtle bg-card px-3 py-2 text-xs text-secondary"
    >
      <div class="api-meta-bar__identity flex items-center gap-2">
        <span class="api-meta-bar__icon" aria-hidden="true"><PbIcon :icon="PhKey" :size="15" /></span>
        <span class="api-meta-bar__label">{{ t('misc.apikeys.serial') }}</span>
        <span id="metaSerial" class="api-meta-bar__serial">{{ store.meta.value?.api_serial || '-' }}</span>
      </div>
      <div class="api-meta-bar__details flex items-center gap-2">
        <span id="metaTs">{{ metaTsText }}</span>
        <span id="metaBy" class="max-[768px]:hidden">{{ metaByText }}</span>
      </div>
    </div>
    <div class="user-list-toolbar">
      <div class="user-filter-control">
        <PbIcon class="user-filter-icon" :icon="PhMagnifyingGlass" :size="15" />
        <Input
          type="text"
          id="userFilter"
          class="w-full pl-9 pr-9"
          :model-value="store.filterText.value"
          :placeholder="t('misc.apikeys.filterByNameOrExchange')"
          @update:model-value="store.setFilter(String($event ?? ''))"
          @keydown="onFilterKeydown"
        />
        <Button
          v-if="store.filterText.value"
          id="userFilterClear"
          class="user-filter-clear"
          type="button"
          variant="ghost"
          size="icon"
          :title="t('misc.apikeys.clearFilter')"
          :aria-label="t('misc.apikeys.clearFilter')"
          @click="clearFilterAndFocus"
        >
          <PbIcon :icon="PhX" :size="14" />
        </Button>
      </div>
    </div>
    <div class="user-table-wrap">
      <table class="user-table mb-0 w-full border-separate border-spacing-0 bg-panel">
        <caption class="sr-only">{{ t('misc.apikeys.users') }}</caption>
        <colgroup>
          <col class="user-table__name-column">
          <col class="user-table__exchange-column">
          <col class="user-table__credentials-column">
          <col class="user-table__expiry-column">
          <col class="user-table__status-column">
          <col class="user-table__actions-column">
        </colgroup>
        <thead>
          <tr>
          <th class="sortable cursor-pointer select-none border-b border-border-default bg-card px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-label text-secondary hover:text-primary" :class="sortClass('name')" :aria-sort="sortAriaValue('name')" id="th-name" @click="store.setSort('name')">
            <span>{{ t('misc.apikeys.user') }}</span>
            <PbIcon v-if="store.sortCol.value === 'name'" class="sort-icon" :icon="store.sortDir.value === 1 ? PhCaretUp : PhCaretDown" />
          </th>
          <th class="sortable cursor-pointer select-none border-b border-border-default bg-card px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-label text-secondary hover:text-primary" :class="sortClass('exchange')" :aria-sort="sortAriaValue('exchange')" id="th-exchange" @click="store.setSort('exchange')">
            <span>{{ t('misc.apikeys.exchange') }}</span>
            <PbIcon v-if="store.sortCol.value === 'exchange'" class="sort-icon" :icon="store.sortDir.value === 1 ? PhCaretUp : PhCaretDown" />
          </th>
          <th class="border-b border-border-default bg-card px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.credentials') }}</th>
          <th class="sortable cursor-pointer select-none border-b border-border-default bg-card px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-label text-secondary hover:text-primary" :class="sortClass('hl_expiry')" :aria-sort="sortAriaValue('hl_expiry')" id="th-hl_expiry" @click="store.setSort('hl_expiry')">
            <span>{{ t('misc.apikeys.keyExpiry') }}</span>
            <PbIcon v-if="store.sortCol.value === 'hl_expiry'" class="sort-icon" :icon="store.sortDir.value === 1 ? PhCaretUp : PhCaretDown" />
          </th>
          <th class="sortable cursor-pointer select-none border-b border-border-default bg-card px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-label text-secondary hover:text-primary" :class="sortClass('status')" :aria-sort="sortAriaValue('status')" id="th-status" @click="store.setSort('status')">
            <span>{{ t('misc.apikeys.status') }}</span>
            <PbIcon v-if="store.sortCol.value === 'status'" class="sort-icon" :icon="store.sortDir.value === 1 ? PhCaretUp : PhCaretDown" />
          </th>
          <th class="border-b border-border-default bg-card px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.actions') }}</th>
          </tr>
        </thead>
        <tbody id="userTableBody">
        <tr v-if="store.usersState.value === 'loading'" class="loading-row">
          <td colspan="6" class="border-b border-border-subtle p-10 text-center text-base text-secondary"><div class="table-state"><span class="mr-1.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-accent align-middle"></span> {{ t('misc.apikeys.loadingUsers') }}</div></td>
        </tr>
        <tr v-else-if="store.usersState.value === 'error'" class="loading-row">
          <td colspan="6" class="border-b border-border-subtle p-10 text-center text-base text-secondary"><div class="table-state table-state--error">{{ t('misc.apikeys.failedToLoad', { error: store.usersError.value }) }}</div></td>
        </tr>
        <tr v-else-if="store.users.value.length === 0" class="loading-row">
          <td colspan="6" class="border-b border-border-subtle p-10 text-center text-base text-secondary"><div class="table-state">{{ t('misc.apikeys.noApiKeysConfigured') }}</div></td>
        </tr>
        <tr v-else-if="store.filteredSortedUsers.value.length === 0" class="loading-row">
          <td colspan="6" class="border-b border-border-subtle p-10 text-center text-base text-secondary"><div class="table-state">{{ t('misc.apikeys.noUsersMatchFilter') }}</div></td>
        </tr>
        <tr
          v-else
          v-for="u in store.filteredSortedUsers.value"
          :key="u.name"
          tabindex="0"
          :data-user-name="u.name"
          class="user-table__row cursor-pointer transition-colors duration-[120ms] ease-standard hover:bg-secondary/5 focus-visible:outline-2 focus-visible:outline-accent-soft focus-visible:-outline-offset-2"
          @click="emit('edit', u.name)"
          @keydown="onRowKeydown($event, u.name)"
        >
          <td class="user-table__name-cell border-b border-border-subtle px-3 py-3 text-base"><strong class="user-name text-primary">{{ u.name }}</strong></td>
          <td class="border-b border-border-subtle px-3 py-2.5 text-base"><span class="badge-exchange inline-block rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="exchangeClass(u.exchange)">{{ u.exchange }}</span></td>
          <td class="border-b border-border-subtle px-3 py-2.5 text-base">
            <div v-if="credsFor(u).length" class="credential-list">
              <span v-for="credential in credsFor(u)" :key="credential" class="credential-chip">{{ credential }}</span>
            </div>
            <span v-else style="color:var(--danger);">{{ t('misc.apikeys.none') }}</span>
          </td>
          <td class="border-b border-border-subtle px-3 py-2.5 text-base">
            <ExpiryBadge v-if="expiryFor(u)" :exp="expiryFor(u)!" />
            <template v-else>-</template>
          </td>
          <td class="border-b border-border-subtle px-3 py-2.5 text-base">
            <span class="badge-in-use inline-block rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="u.in_use ? 'border-success/30 bg-success/10 text-success' : 'border border-secondary/14 bg-secondary/7 text-secondary'">{{ u.in_use ? t('misc.apikeys.inUse') : t('misc.apikeys.unused') }}</span>
          </td>
          <td class="border-b border-border-subtle px-3 py-2.5 text-base">
            <div class="action-group">
              <Button variant="info" size="sm" type="button" data-user-action="edit" @click.stop="emit('edit', u.name)">{{ t('misc.apikeys.edit') }}</Button>
              <Button
                v-if="!u.in_use"
                variant="danger"
                size="sm"
                type="button"
                data-user-action="delete"
                @click.stop="emit('delete', u.name)"
              >
                {{ t('common.delete') }}
              </Button>
            </div>
          </td>
        </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* Sort affordances + last-row rule ported from styles/api_keys_editor.css at
   the Tailwind migration — pseudo-elements and the parent-relative last-row
   descendant are not expressible as utilities. 'user-table', 'sort-icon',
   'sort-asc' and 'sort-desc' remain as inert anchors. */
.user-list-toolbar {
  display: flex;
  align-items: center;
  min-height: 32px;
  margin-bottom: 12px;
}

.user-filter-control {
  position: relative;
  width: min(100%, 420px);
  max-width: 100%;
}

.user-filter-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  z-index: 1;
  color: var(--text-muted);
  pointer-events: none;
  transform: translateY(-50%);
}

.user-filter-clear {
  position: absolute;
  top: 50%;
  right: 4px;
  width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  transform: translateY(-50%);
}

.user-table .sort-icon {
  display: inline-block;
  margin-left: 2px;
  color: var(--accent-soft);
  vertical-align: -2px;
}

.api-meta-bar {
  background: rgb(var(--accent-rgb) / 0.055);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
}

.api-meta-bar__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgb(var(--accent-rgb) / 0.24);
  border-radius: var(--radius-sm);
  background: rgb(var(--accent-rgb) / 0.1);
  color: var(--accent-soft);
}

.api-meta-bar__label,
.api-meta-bar__details {
  color: var(--text-muted);
}

.api-meta-bar__serial {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.user-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  scrollbar-color: var(--border-strong) transparent;
  scrollbar-width: thin;
}

.user-table-wrap::-webkit-scrollbar {
  height: 5px;
}

.user-table-wrap::-webkit-scrollbar-track {
  background: transparent;
}

.user-table-wrap::-webkit-scrollbar-thumb {
  border-radius: var(--radius-full);
  background: var(--border-strong);
}

.user-table {
  min-width: 780px;
}

.user-table__name-column { width: 24%; }
.user-table__exchange-column { width: 15%; }
.user-table__credentials-column { width: 20%; }
.user-table__expiry-column { width: 16%; }
.user-table__status-column { width: 13%; }
.user-table__actions-column { width: 12%; }

.user-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  white-space: nowrap;
}

.user-table__row td {
  min-height: 48px;
  transition: background-color var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard);
}

.user-table__row:hover td {
  background: rgb(var(--accent-rgb) / 0.045);
}

.user-table__name-cell {
  border-left: 3px solid transparent;
}

.user-table__row:hover .user-table__name-cell,
.user-table__row:focus-visible .user-table__name-cell {
  border-left-color: var(--accent);
}

.user-name {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  letter-spacing: 0.01em;
}

.credential-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.credential-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 7px;
  border: 1px solid rgb(var(--text-secondary-rgb) / 0.16);
  border-radius: var(--radius-sm);
  background: rgb(var(--text-secondary-rgb) / 0.07);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  line-height: 1.2;
}

.action-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.table-state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
}

.table-state--error {
  color: var(--danger-soft);
}

@media (max-width: 480px) {
  .user-filter-control {
    width: 100%;
  }

  .api-meta-bar {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .api-meta-bar__details {
    padding-left: 34px;
  }
}

.user-table tbody tr:last-child td {
  border-bottom: none;
}
</style>
