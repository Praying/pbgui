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
  <div id="bybitExpiryPanel" class="hl-expiry-panel">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <BackButton @back="emit('back')" />
      <h3 style="margin:0;">{{ t('misc.apikeys.bybitApiKeyExpiry') }}</h3>
    </div>
    <table class="hl-expiry-table">
      <thead>
        <tr>
          <th>{{ t('misc.apikeys.user') }}</th>
          <th>{{ t('misc.apikeys.expiry') }}</th>
          <th>{{ t('misc.apikeys.daysLeft') }}</th>
          <th>{{ t('misc.apikeys.status') }}</th>
          <th>{{ t('misc.apikeys.ipsLive') }}</th>
        </tr>
      </thead>
      <tbody id="bybitExpiryBody">
        <tr v-if="rows.length === 0">
          <td colspan="5" style="text-align:center;color:#a29ca6;">{{ t('misc.apikeys.noBybitUsersFound') }}</td>
        </tr>
        <tr v-else v-for="exp in rows" :key="exp.name">
          <td><strong>{{ exp.name }}</strong></td>
          <td>{{ exp.expires_at_iso && exp.status !== 'no_expiry' ? exp.expires_at_iso.split('T')[0] : '—' }}</td>
          <td>{{ exp.days_remaining != null ? exp.days_remaining + 'd' : '—' }}</td>
          <td><ExpiryBadge :exp="exp" /></td>
          <td>
            <template v-if="exp.ips && exp.ips.length > 0">
              <span v-for="ip in exp.ips" :key="ip" style="font-family:monospace;font-size:var(--fs-xs);margin-right:8px;">{{ ip }}</span>
            </template>
            <span v-else style="color:#a29ca6;font-size:var(--fs-xs);">{{ t('misc.apikeys.noneUnrestricted') }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
