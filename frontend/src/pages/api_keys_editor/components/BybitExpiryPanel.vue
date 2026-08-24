<script setup lang="ts">
/* Bybit expiry panel (:849-867 markup, render :1745-1769): all Bybit users
   sorted by status severity, with the live (never persisted) IP whitelist. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BackButton from './BackButton.vue';
import ExpiryBadge from './ExpiryBadge.vue';
import { bybitPanelOrder, sortByPanelOrder } from '../lib/expiry';
import type { BybitExpiryInfo } from '../types';

const emit = defineEmits<{ (e: 'back'): void }>();

const props = defineProps<{ data: BybitExpiryInfo[] }>();

const { t } = useI18n();

const rows = computed(() => sortByPanelOrder(props.data, bybitPanelOrder));
</script>

<template>
  <div id="bybitExpiryPanel" class="hl-expiry-panel mx-auto mb-5 w-[min(100%,1500px)] rounded-lg border border-border-subtle bg-panel p-4 max-[768px]:p-3">
    <div class="border-b border-border-subtle pb-3" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <BackButton @back="emit('back')" />
      <h3 class="text-lg tracking-tight text-primary" style="margin:0;">{{ t('misc.apikeys.bybitApiKeyExpiry') }}</h3>
    </div>
    <table class="hl-expiry-table w-full overflow-hidden rounded-md border border-border-subtle border-separate border-spacing-0">
      <thead>
        <tr>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.user') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.expiry') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.daysLeft') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.status') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.ipsLive') }}</th>
        </tr>
      </thead>
      <tbody id="bybitExpiryBody">
        <tr v-if="rows.length === 0">
          <td colspan="5" class="border-b border-border-subtle px-2.5 py-2 text-sm" style="text-align:center;color:var(--text-secondary);">{{ t('misc.apikeys.noBybitUsersFound') }}</td>
        </tr>
        <tr v-else v-for="exp in rows" :key="exp.name">
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm"><strong class="text-primary">{{ exp.name }}</strong></td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm">{{ exp.expires_at_iso && exp.status !== 'no_expiry' ? exp.expires_at_iso.split('T')[0] : '—' }}</td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm">{{ exp.days_remaining != null ? exp.days_remaining + 'd' : '—' }}</td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm"><ExpiryBadge :exp="exp" /></td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm">
            <template v-if="exp.ips && exp.ips.length > 0">
              <span v-for="ip in exp.ips" :key="ip" style="font-family:monospace;font-size:var(--fs-xs);margin-right:8px;">{{ ip }}</span>
            </template>
            <span v-else style="color:var(--text-secondary);font-size:var(--fs-xs);">{{ t('misc.apikeys.noneUnrestricted') }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
