<script setup lang="ts">
/*
 * User list table (:673-707 markup, render :1309-1491): API-keys meta bar,
 * filter box, sortable columns with keyboard row navigation, credentials and
 * expiry badges, in-use state and row actions.
 */
import { computed } from 'vue';
import { PhArrowsDownUp, PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
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

/** Exchange → badge tint (the former .badge-exchange.<name> colour rules).
 *  Each branch returns the complete border/background/text colour set so the
 *  static layout utilities on the span never fight a dynamic colour. */
function exchangeClass(exchange: string | undefined): string {
  switch (exchange) {
    case 'binance': return 'border border-secondary/14 bg-secondary/7 text-[#c9a961]';
    case 'bybit': return 'border border-secondary/14 bg-secondary/7 text-[#c79a6b]';
    case 'bitget': return 'border border-secondary/14 bg-secondary/7 text-[#6fbc9f]';
    case 'hyperliquid': return 'border border-secondary/14 bg-secondary/7 text-success';
    case 'okx': return 'border border-secondary/14 bg-secondary/7 text-secondary';
    case 'gateio': return 'border border-secondary/14 bg-secondary/7 text-accent';
    case 'kucoin': return 'border border-secondary/14 bg-secondary/7 text-[#86ad9e]';
    default: return 'border border-secondary/14 bg-secondary/7 text-secondary';
  }
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
      class="mb-3 flex min-h-[34px] items-center gap-1.5 rounded-md border border-border-subtle bg-card px-3 py-1.5 text-xs text-secondary"
    >
      <span>{{ t('misc.apikeys.serial') }}</span>
      <span id="metaSerial" style="color:var(--text-primary); font-weight:700;">{{ store.meta.value?.api_serial || '—' }}</span>
      <span id="metaTs" style="color:var(--text-secondary);">{{ metaTsText }}</span>
      <span id="metaBy" class="max-[768px]:hidden" style="color:var(--text-muted);">{{ metaByText }}</span>
    </div>
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
      <input
        type="text"
        id="userFilter"
        class="flex-1 rounded-sm border border-border-default bg-page px-2.5 py-1.5 text-sm text-primary focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_rgb(114,160,238,0.3)]"
        :value="store.filterText.value"
        :placeholder="t('misc.apikeys.filterByNameOrExchange')"
        @input="store.setFilter(($event.target as HTMLInputElement).value)"
        @keydown="onFilterKeydown"
      />
      <button
        class="btn pbgui-btn btn-sm btn-secondary"
        :title="t('misc.apikeys.clearFilter')"
        :aria-label="t('misc.apikeys.clearFilter')"
        @click="clearFilterAndFocus"
      >
        <PbIcon :icon="PhX" />
      </button>
    </div>
    <table class="user-table mb-5 w-full max-[768px]:block max-[768px]:overflow-x-auto max-[768px]:whitespace-nowrap overflow-hidden rounded-lg border border-border-subtle border-separate border-spacing-0 bg-panel">
      <thead>
        <tr>
          <th class="sortable cursor-pointer select-none border-b border-border-default bg-card px-3 py-2.25 text-left text-xs font-semibold uppercase tracking-label text-secondary hover:text-primary" :class="sortClass('name')" id="th-name" @click="store.setSort('name')">
            <span>{{ t('misc.apikeys.user') }}</span> <PbIcon class="sort-icon" :icon="PhArrowsDownUp" />
          </th>
          <th class="sortable cursor-pointer select-none border-b border-border-default bg-card px-3 py-2.25 text-left text-xs font-semibold uppercase tracking-label text-secondary hover:text-primary" :class="sortClass('exchange')" id="th-exchange" @click="store.setSort('exchange')">
            <span>{{ t('misc.apikeys.exchange') }}</span> <PbIcon class="sort-icon" :icon="PhArrowsDownUp" />
          </th>
          <th class="border-b border-border-default bg-card px-3 py-2.25 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.credentials') }}</th>
          <th class="sortable cursor-pointer select-none border-b border-border-default bg-card px-3 py-2.25 text-left text-xs font-semibold uppercase tracking-label text-secondary hover:text-primary" :class="sortClass('hl_expiry')" id="th-hl_expiry" @click="store.setSort('hl_expiry')">
            <span>{{ t('misc.apikeys.keyExpiry') }}</span> <PbIcon class="sort-icon" :icon="PhArrowsDownUp" />
          </th>
          <th class="sortable cursor-pointer select-none border-b border-border-default bg-card px-3 py-2.25 text-left text-xs font-semibold uppercase tracking-label text-secondary hover:text-primary" :class="sortClass('status')" id="th-status" @click="store.setSort('status')">
            <span>{{ t('misc.apikeys.status') }}</span> <PbIcon class="sort-icon" :icon="PhArrowsDownUp" />
          </th>
          <th class="border-b border-border-default bg-card px-3 py-2.25 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.actions') }}</th>
        </tr>
      </thead>
      <tbody id="userTableBody">
        <tr v-if="store.usersState.value === 'loading'" class="loading-row">
          <td colspan="6" class="border-b border-border-subtle p-10 text-center text-base text-secondary"><span class="mr-1.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-accent align-middle"></span> {{ t('misc.apikeys.loadingUsers') }}</td>
        </tr>
        <tr v-else-if="store.usersState.value === 'error'" class="loading-row">
          <td colspan="6" class="border-b border-border-subtle p-10 text-center text-base text-secondary" style="color:var(--danger);">{{ t('misc.apikeys.failedToLoad', { error: store.usersError.value }) }}</td>
        </tr>
        <tr v-else-if="store.users.value.length === 0" class="loading-row">
          <td colspan="6" class="border-b border-border-subtle p-10 text-center text-base text-secondary">{{ t('misc.apikeys.noApiKeysConfigured') }}</td>
        </tr>
        <tr v-else-if="store.filteredSortedUsers.value.length === 0" class="loading-row">
          <td colspan="6" class="border-b border-border-subtle p-10 text-center text-base text-secondary" style="color:var(--text-secondary);">{{ t('misc.apikeys.noUsersMatchFilter') }}</td>
        </tr>
        <tr
          v-else
          v-for="u in store.filteredSortedUsers.value"
          :key="u.name"
          tabindex="0"
          :data-user-name="u.name"
          class="cursor-pointer transition-colors duration-[120ms] ease-standard hover:bg-secondary/5 focus-visible:outline-2 focus-visible:outline-accent-soft focus-visible:-outline-offset-2"
          style="cursor:pointer;"
          @click="emit('edit', u.name)"
          @keydown="onRowKeydown($event, u.name)"
        >
          <td class="border-b border-border-subtle px-3 py-2.5 text-base"><strong class="text-primary">{{ u.name }}</strong></td>
          <td class="border-b border-border-subtle px-3 py-2.5 text-base"><span class="badge-exchange inline-block rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="exchangeClass(u.exchange)">{{ u.exchange }}</span></td>
          <td class="border-b border-border-subtle px-3 py-2.5 text-base">
            <template v-if="credsFor(u).length">{{ credsFor(u).join(', ') }}</template>
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

<style scoped>
/* Sort affordances + last-row rule ported from styles/api_keys_editor.css at
   the Tailwind migration — pseudo-elements and the parent-relative last-row
   descendant are not expressible as utilities. 'user-table', 'sort-icon',
   'sort-asc' and 'sort-desc' remain as inert anchors. */
.user-table th.sort-asc .sort-icon::after {
  content: " ▲";
  color: var(--accent-soft);
}
.user-table th.sort-desc .sort-icon::after {
  content: " ▼";
  color: var(--accent-soft);
}
.user-table th.sort-asc .sort-icon,
.user-table th.sort-desc .sort-icon {
  display: none;
}

.user-table tbody tr:last-child td {
  border-bottom: none;
}
</style>
