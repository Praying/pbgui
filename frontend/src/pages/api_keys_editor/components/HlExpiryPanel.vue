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
  <div id="hlExpiryPanel" class="hl-expiry-panel mx-auto mb-5 w-[min(100%,1500px)] rounded-lg border border-border-subtle bg-panel p-4 max-[768px]:p-3">
    <div class="border-b border-border-subtle pb-3" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <BackButton @back="emit('back')" />
      <h3 class="text-lg tracking-tight text-primary" style="margin:0;">{{ t('misc.apikeys.hyperliquidApiKeyExpiry') }}</h3>
    </div>
    <table class="hl-expiry-table w-full overflow-hidden rounded-md border border-border-subtle border-separate border-spacing-0">
      <thead>
        <tr>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.user') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.type') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.expiry') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.daysLeft') }}</th>
          <th class="border-b border-border-default bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.status') }}</th>
        </tr>
      </thead>
      <tbody id="hlExpiryBody">
        <tr v-if="rows.length === 0">
          <td colspan="5" class="border-b border-border-subtle px-2.5 py-2 text-sm" style="text-align:center;color:var(--text-secondary);">{{ t('misc.apikeys.noHyperliquidUsersFound') }}</td>
        </tr>
        <tr v-else v-for="exp in rows" :key="exp.name">
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm"><strong class="text-primary">{{ exp.name }}</strong></td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm">{{ exp.is_vault ? t('misc.apikeys.vault') : t('misc.apikeys.wallet') }}</td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm">{{ exp.valid_until_iso ? exp.valid_until_iso.split('T')[0] : '-' }}</td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm">{{ exp.days_remaining !== null && exp.days_remaining !== undefined ? exp.days_remaining : '-' }}</td>
          <td class="border-b border-border-subtle px-2.5 py-2 text-sm"><ExpiryBadge :exp="exp" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
