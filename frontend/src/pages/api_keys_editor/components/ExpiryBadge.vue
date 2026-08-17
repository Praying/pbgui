<script setup lang="ts">
/*
 * Expiry badge (:1475-1491): status-colored pill, days label for live states,
 * localized text for terminal states, error tooltip.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { expiryBadgeClass, expiryDaysLabel, expiryWarns } from '../lib/expiry';
import type { ExpiryBadgeLike } from '../lib/expiry';

const props = defineProps<{ exp: ExpiryBadgeLike | null }>();

const { t } = useI18n();

const cls = computed(() => expiryBadgeClass(props.exp));
const status = computed(() => props.exp?.status ?? null);

const label = computed(() => {
  const exp = props.exp;
  if (!exp) return '—';
  switch (cls.value) {
    case 'ok':
    case 'expiring_soon':
    case 'critical':
      return (expiryWarns(status.value) ? '⚠ ' : '') + expiryDaysLabel(exp);
    case 'expired':
      return t('misc.apikeys.expired');
    case 'no_expiry':
      return t('misc.apikeys.noExpiry');
    case 'error':
      return t('common.error');
    default:
      return '—';
  }
});
</script>

<template>
  <span class="badge-expiry" :class="cls" :title="cls === 'error' ? (exp?.error || '') : undefined">{{ label }}</span>
</template>
