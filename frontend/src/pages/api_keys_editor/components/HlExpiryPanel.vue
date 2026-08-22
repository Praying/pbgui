<script setup lang="ts">
/* HL expiry panel (:829-847 markup, render :2087-2109): all Hyperliquid
   users sorted by status severity (expired first). Data is fetched by App. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BackButton from './BackButton.vue';
import ExpiryBadge from './ExpiryBadge.vue';
import { hlPanelOrder, sortByPanelOrder } from '../lib/expiry';
import type { HlExpiryInfo } from '../types';

const emit = defineEmits<{ (e: 'back'): void }>();

const props = defineProps<{ data: HlExpiryInfo[] }>();

const { t } = useI18n();

const rows = computed(() => sortByPanelOrder(props.data, hlPanelOrder));
</script>

<template>
  <div id="hlExpiryPanel" class="hl-expiry-panel">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <BackButton @back="emit('back')" />
      <h3 style="margin:0;">{{ t('misc.apikeys.hyperliquidApiKeyExpiry') }}</h3>
    </div>
    <table class="hl-expiry-table">
      <thead>
        <tr>
          <th>{{ t('misc.apikeys.user') }}</th>
          <th>{{ t('misc.apikeys.type') }}</th>
          <th>{{ t('misc.apikeys.expiry') }}</th>
          <th>{{ t('misc.apikeys.daysLeft') }}</th>
          <th>{{ t('misc.apikeys.status') }}</th>
        </tr>
      </thead>
      <tbody id="hlExpiryBody">
        <tr v-if="rows.length === 0">
          <td colspan="5" style="text-align:center;color:#a29ca6;">{{ t('misc.apikeys.noHyperliquidUsersFound') }}</td>
        </tr>
        <tr v-else v-for="exp in rows" :key="exp.name">
          <td><strong>{{ exp.name }}</strong></td>
          <td>{{ exp.is_vault ? t('misc.apikeys.vault') : t('misc.apikeys.wallet') }}</td>
          <td>{{ exp.valid_until_iso ? exp.valid_until_iso.split('T')[0] : '-' }}</td>
          <td>{{ exp.days_remaining !== null && exp.days_remaining !== undefined ? exp.days_remaining : '-' }}</td>
          <td><ExpiryBadge :exp="exp" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
