<script setup lang="ts">
/*
 * M-data-6 — the per-coin OHLCV details block (legacy :3572-3575 +
 * syncInventoryOhlcvFrame :8557-8583, market_data_main.html): hidden for
 * l2book rows, lazy-loaded iframe src applied only while open (:8576-8582)
 * — the frame never mounts with a stale URL.
 */
import { useI18n } from 'vue-i18n';

defineProps<{
  /** details.hidden — row has no chart (:8564). */
  visible: boolean;
  /** details.open — the toggle state (:9580-9586). */
  open: boolean;
  summary: string;
  /** The precomputed URL; empty until a row is selected (:8576). */
  src: string;
}>();

const emit = defineEmits<{
  /** Native details toggle (:9580-9586) — the next open state. */
  toggle: [open: boolean];
}>();

const { t } = useI18n();
</script>

<template>
  <details
    v-if="visible"
    class="inventory-ohlcv-details overflow-hidden rounded-[10px] border border-accent/12 bg-page/36"
    id="inventory-ohlcv-details"
    :open="open"
    @toggle="emit('toggle', ($event.target as HTMLDetailsElement).open)"
  >
    <summary class="cursor-pointer list-none bg-panel/70 p-3 font-semibold text-primary [&::-webkit-details-marker]:hidden" id="inventory-ohlcv-summary">{{ summary }}</summary>
    <iframe
      v-if="open && src"
      class="inventory-ohlcv-frame block h-[630px] w-full border-0 bg-transparent"
      id="inventory-ohlcv-frame"
      :title="t('market.inventoryOhlcvChart')"
      :src="src"
      loading="lazy"
    ></iframe>
  </details>
</template>
