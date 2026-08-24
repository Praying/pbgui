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

/* Status → Tailwind utility mapping (the former .badge-expiry.<status> tints
   in styles/api_keys_editor.css). Each branch returns the FULL
   border/background/text colour set so the static layout utilities on the
   span never fight a dynamic colour. */
const toneClass = computed<string>(() => {
  switch (cls.value) {
    case 'ok':
      return 'border border-success/30 bg-success/10 text-success';
    case 'expiring_soon':
      return 'border border-warning/32 bg-warning/10 text-warning-soft';
    case 'critical':
    case 'error':
      return 'border border-danger/32 bg-danger/10 text-danger-soft';
    case 'expired':
    case 'unknown':
      return 'border border-secondary/14 bg-secondary/7 text-muted';
    default:
      return 'border border-secondary/14 bg-secondary/7 text-secondary';
  }
});

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
  <span class="badge-expiry inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="toneClass" :title="cls === 'error' ? (exp?.error || '') : undefined">{{ label }}</span>
</template>
