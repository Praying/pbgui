<script setup lang="ts">
/**
 * Side statistics panel — the renderStats port (:1365-1389): active chip,
 * mode chip, metric cards, entry/close order tables (orderRows :1179-1186)
 * and the collapsed Rust debug accordion with JSON blocks (:1356-1358).
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { deepGet, fmt, fmtFixed } from '../lib/format';
import type { ExplorerStore } from '../composables/useStrategyExplorer';
import type { StrategyOrder } from '../types';

const props = defineProps<{ store: ExplorerStore; sideKey: 'long' | 'short' }>();
const { t } = useI18n();
const store = props.store;
const debugOpen = ref(false);

const side = () => deepGet<Record<string, unknown>>(store.state.snapshot, ['sides', props.sideKey], {}) as Record<string, unknown>;
const summary = () => (side().summary || {}) as Record<string, number>;
const entries = () => deepGet<StrategyOrder[]>(side(), ['orders', 'entries'], []);
const closes = () => deepGet<StrategyOrder[]>(side(), ['orders', 'closes'], []);
const modes = () => (side().modes || {}) as { entry?: string; close?: string };

interface OrderRow {
  idx: number;
  qty: string;
  price: string;
  twe: string;
  type: string;
}
function orderRows(orders: StrategyOrder[]): OrderRow[] {
  if (!orders || !orders.length) return [];
  return orders.map((order) => {
    const idx = Number(order.index);
    return {
      idx: Math.max(0, (isFinite(idx) ? idx : 1) - 1),
      qty: fmtFixed(order.qty, 4),
      price: fmtFixed(order.price, 4),
      twe: String(order.max_twe_pct_after || 0),
      type: String(order.order_type || order.type || ''),
    };
  });
}

const DEBUG_BLOCKS = [
  ['Sent to Rust', ['debug', 'entry_input']],
  ['Received from Rust (Decoded)', ['debug', 'entry_output_decoded']],
  ['GridOnly Entries (Decoded)', ['debug', 'entry_gridonly_output_decoded']],
  ['GridFirst cutoff (from grid-only orders; approx trailing start)', ['debug', 'potential_trailing']],
  ['Next Entry (Current State)', ['debug', 'next_entry_current']],
  ['Trailing Chain (Forced Trigger, Debug)', ['debug', 'forced_trailing_chain']],
] as const;
</script>

<template>
  <section :id="sideKey + '-stats'" class="p-3.5 border border-secondary/13 rounded-xl bg-page/76 [content-visibility:auto] [contain-intrinsic-size:720px]">
    <div class="flex items-center justify-between gap-3 border border-secondary/13 rounded-t-[10px] bg-page/84 py-2.25 px-3">
      <h3 class="m-0 text-primary text-md tracking-[0.08em]">{{ t('v7explore.sideStatistics', { side: sideKey.toUpperCase() }) }}</h3>
      <span class="inline-flex min-h-[25px] items-center gap-1.5 rounded-full border border-border-default bg-elevated px-2 py-0.75 text-[10px] text-secondary">{{ modes().entry || '-' }} / {{ modes().close || '-' }}</span>
    </div>
    <div class="grid gap-3" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:12px">
      <div class="min-w-0 rounded-lg border border-border-default bg-elevated p-3"><div class="text-secondary text-xs uppercase tracking-[0.05em]">{{ t('v7explore.entryOrders') }}</div><div class="mt-1 truncate text-lg font-bold">{{ summary().entry_orders || 0 }}</div></div>
      <div class="min-w-0 rounded-lg border border-border-default bg-elevated p-3"><div class="text-secondary text-xs uppercase tracking-[0.05em]">{{ t('v7explore.entryAvg') }}</div><div class="mt-1 truncate text-lg font-bold">{{ fmt(summary().entry_avg_price, 8) }}</div></div>
      <div class="min-w-0 rounded-lg border border-border-default bg-elevated p-3"><div class="text-secondary text-xs uppercase tracking-[0.05em]">{{ t('v7explore.entryGrid') }}</div><div class="mt-1 truncate text-lg font-bold">{{ fmt(summary().entry_grid_pct, 2) }}%</div></div>
      <div class="min-w-0 rounded-lg border border-border-default bg-elevated p-3"><div class="text-secondary text-xs uppercase tracking-[0.05em]">{{ t('v7explore.welPerPos') }}</div><div class="mt-1 truncate text-lg font-bold">{{ fmt(summary().wallet_exposure_limit_per_position, 4) }}</div></div>
    </div>
    <h4 class="m-0 mb-2.5 mt-4 text-secondary">{{ t('v7explore.entryOrders') }}</h4>
    <table class="orders">
      <thead><tr><th></th><th>{{ t('v7explore.qty') }}</th><th>{{ t('v7explore.price') }}</th><th>{{ t('v7explore.maxTweAfter') }}</th><th>{{ t('v7explore.orderType') }}</th></tr></thead>
      <tbody>
        <tr v-if="!orderRows(entries()).length"><td colspan="5" class="text-secondary" style="text-align:left">{{ t('common.none') }}</td></tr>
        <tr v-for="(row, i) in orderRows(entries())" :key="'e' + i"><td>{{ row.idx }}</td><td>{{ row.qty }}</td><td>{{ row.price }}</td><td>{{ row.twe }}</td><td>{{ row.type }}</td></tr>
      </tbody>
    </table>
    <h4 class="m-0 mb-2.5 mt-4 text-secondary">{{ t('v7explore.closeOrders') }}</h4>
    <table class="orders">
      <thead><tr><th></th><th>{{ t('v7explore.qty') }}</th><th>{{ t('v7explore.price') }}</th><th>{{ t('v7explore.maxTweAfter') }}</th><th>{{ t('v7explore.orderType') }}</th></tr></thead>
      <tbody>
        <tr v-if="!orderRows(closes()).length"><td colspan="5" class="text-secondary" style="text-align:left">{{ t('common.none') }}</td></tr>
        <tr v-for="(row, i) in orderRows(closes())" :key="'c' + i"><td>{{ row.idx }}</td><td>{{ row.qty }}</td><td>{{ row.price }}</td><td>{{ row.twe }}</td><td>{{ row.type }}</td></tr>
      </tbody>
    </table>
    <section class="accordion-card overflow-hidden rounded-lg border border-border-default bg-panel" :class="{ collapsed: !debugOpen }" style="margin-top:14px">
      <button class="accordion-head flex w-full items-center gap-2.5 border-0 bg-panel px-3 py-2.5 text-left text-primary" type="button" @click="debugOpen = !debugOpen">
        {{ t('v7explore.debugRustInterface', { side: sideKey.toUpperCase() }) }}
      </button>
      <div class="accordion-body border-t border-border-default p-3">
        <template v-for="[title, path] in DEBUG_BLOCKS" :key="title">
          <h4 class="m-0 mb-2.5 mt-4 text-secondary">{{ title }}</h4>
          <pre class="w-full max-h-[460px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-default bg-page p-2.5 font-mono text-xs">{{ JSON.stringify(deepGet(side(), path as unknown as string[], {}) || {}, null, 2) }}</pre>
        </template>
        <div v-if="deepGet<string>(side(), ['debug', 'next_entry_error'], '')" class="border rounded-[9px] px-3.25 py-2.5 border-danger/38 bg-danger-deep/24 text-danger-soft">{{ deepGet(side(), ['debug', 'next_entry_error'], '') }}</div>
      </div>
    </section>
  </section>
</template>
