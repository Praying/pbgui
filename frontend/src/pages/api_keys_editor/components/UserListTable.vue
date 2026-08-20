<script setup lang="ts">
/*
 * User list table (:673-707 markup, render :1309-1491): API-keys meta bar,
 * filter box, sortable columns with keyboard row navigation, credentials and
 * expiry badges, in-use state and row actions.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
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
  return '— ' + d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
});

const metaByText = computed(() => {
  const by = store.meta.value?.api_by;
  return by ? t('misc.apikeys.byPrefix', { name: by }) : '';
});

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
  <div id="userListView">
    <!-- API keys metadata bar -->
    <div
      id="apiMetaBar"
      style="display:flex; align-items:center; gap:6px; margin-bottom:8px; padding:4px 8px; background:#0f172a; border:1px solid #1e293b; border-radius:5px; font-size:var(--fs-xs); color:#94a3b8;"
    >
      <span>{{ t('misc.apikeys.serial') }}</span>
      <span id="metaSerial" style="color:#e2e8f0; font-weight:700;">{{ store.meta.value?.api_serial || '—' }}</span>
      <span id="metaTs" style="color:#94a3b8;">{{ metaTsText }}</span>
      <span id="metaBy" style="color:#64748b;">{{ metaByText }}</span>
    </div>
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
      <input
        type="text"
        id="userFilter"
        :value="store.filterText.value"
        :placeholder="t('misc.apikeys.filterByNameOrExchange')"
        @input="store.setFilter(($event.target as HTMLInputElement).value)"
        @keydown="onFilterKeydown"
        style="flex:1; background:#0e1117; border:1px solid #2d3748; border-radius:4px; padding:6px 10px; color:#fafafa; font-size:var(--fs-sm);"
      />
      <button
        class="btn pbgui-btn btn-sm btn-secondary"
        :title="t('misc.apikeys.clearFilter')"
        @click="clearFilterAndFocus"
      >
        ✕
      </button>
    </div>
    <table class="user-table">
      <thead>
        <tr>
          <th class="sortable" :class="sortClass('name')" id="th-name" @click="store.setSort('name')">
            <span>{{ t('misc.apikeys.user') }}</span> <span class="sort-icon">⇅</span>
          </th>
          <th class="sortable" :class="sortClass('exchange')" id="th-exchange" @click="store.setSort('exchange')">
            <span>{{ t('misc.apikeys.exchange') }}</span> <span class="sort-icon">⇅</span>
          </th>
          <th>{{ t('misc.apikeys.credentials') }}</th>
          <th class="sortable" :class="sortClass('hl_expiry')" id="th-hl_expiry" @click="store.setSort('hl_expiry')">
            <span>{{ t('misc.apikeys.keyExpiry') }}</span> <span class="sort-icon">⇅</span>
          </th>
          <th class="sortable" :class="sortClass('status')" id="th-status" @click="store.setSort('status')">
            <span>{{ t('misc.apikeys.status') }}</span> <span class="sort-icon">⇅</span>
          </th>
          <th>{{ t('misc.apikeys.actions') }}</th>
        </tr>
      </thead>
      <tbody id="userTableBody">
        <tr v-if="store.usersState.value === 'loading'" class="loading-row">
          <td colspan="6"><span class="spinner"></span> {{ t('misc.apikeys.loadingUsers') }}</td>
        </tr>
        <tr v-else-if="store.usersState.value === 'error'" class="loading-row">
          <td colspan="6" style="color:#ef4444;">{{ t('misc.apikeys.failedToLoad', { error: store.usersError.value }) }}</td>
        </tr>
        <tr v-else-if="store.users.value.length === 0" class="loading-row">
          <td colspan="6">{{ t('misc.apikeys.noApiKeysConfigured') }}</td>
        </tr>
        <tr v-else-if="store.filteredSortedUsers.value.length === 0" class="loading-row">
          <td colspan="6" style="color:#94a3b8;">{{ t('misc.apikeys.noUsersMatchFilter') }}</td>
        </tr>
        <tr
          v-else
          v-for="u in store.filteredSortedUsers.value"
          :key="u.name"
          tabindex="0"
          :data-user-name="u.name"
          style="cursor:pointer;"
          @click="emit('edit', u.name)"
          @keydown="onRowKeydown($event, u.name)"
        >
          <td><strong>{{ u.name }}</strong></td>
          <td><span class="badge-exchange" :class="u.exchange || ''">{{ u.exchange }}</span></td>
          <td>
            <template v-if="credsFor(u).length">{{ credsFor(u).join(', ') }}</template>
            <span v-else style="color:#ef4444;">{{ t('misc.apikeys.none') }}</span>
          </td>
          <td>
            <ExpiryBadge v-if="expiryFor(u)" :exp="expiryFor(u)!" />
            <template v-else>-</template>
          </td>
          <td>
            <span class="badge-in-use" :class="{ active: u.in_use }">{{ u.in_use ? t('misc.apikeys.inUse') : t('misc.apikeys.unused') }}</span>
          </td>
          <td>
            <button class="btn pbgui-btn btn-sm btn-info" data-user-action="edit" @click.stop="emit('edit', u.name)">{{ t('misc.apikeys.edit') }}</button>
            <button
              v-if="!u.in_use"
              class="btn pbgui-btn btn-sm btn-danger"
              data-user-action="delete"
              @click.stop="emit('delete', u.name)"
            >
              {{ t('common.delete') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
