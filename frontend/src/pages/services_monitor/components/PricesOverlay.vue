<script lang="ts">
import { PRECISION_PALETTE } from '@/shared/lib/precisionPalette';

/*
 * Page-global prices overlay, ported 1:1 from the Prices Overlay IIFE of
 * frontend/services_monitor.html (openPricesOverlay/closePricesOverlay/
 * loadPricesOverlay/filterPricesOverlay + fmtPrice/fmtAge/ageCol/tsSeconds/
 * ageSeconds and the title-bar drag). The App shell mounts it once per page
 * and calls open() from the pbdata fetch-summary Prices group.
 *
 * Auto-refresh mirrors the legacy timers: a silent snapshot reload every 5s
 * plus a 1s re-render tick that keeps the Age column fresh; both only run
 * while the overlay is open. Overlapping loads are dropped (_pricesLoading).
 */

/** Legacy fmtPrice: locale grouping ≥1000, fixed decimals below, precision for tiny. */
export function fmtPrice(p: number | null | undefined): string {
  if (p == null) return '—';
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (p >= 0.001) return p.toFixed(6);
  return p.toPrecision(4);
}

/** Legacy tsSeconds: epoch seconds from s or ms timestamps, null when invalid. */
export function tsSeconds(ts: number | string | null | undefined): number | null {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 100000000000 ? Math.floor(n / 1000) : Math.floor(n);
}

/** Legacy ageSeconds: clamped seconds since ts, null when invalid. */
export function ageSeconds(ts: number | string | null | undefined): number | null {
  const sec = tsSeconds(ts);
  if (sec == null) return null;
  const s = Math.floor(Date.now() / 1000) - sec;
  return s < 0 ? 0 : s;
}

/** Legacy fmtAge: '—' for missing, s/m/h ages otherwise. */
export function fmtAge(ts: number | string | null | undefined): string {
  const s = ageSeconds(ts);
  if (s == null) return '—';
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
}

/**
 * Legacy ageCol: fresh <60s, stale <5m, old beyond, grey for missing.
 * JS-computed color strings (inline style bindings), so these stay literal
 * Palette constants (var(--success)/--warning/--danger/--text-disabled).
 */
export function ageCol(ts: number | string | null | undefined): string {
  const s = ageSeconds(ts);
  if (s == null) return PRECISION_PALETTE.text.muted;
  return s < 60 ? PRECISION_PALETTE.success.base : s < 300 ? PRECISION_PALETTE.warning.base : PRECISION_PALETTE.danger.base;
}
</script>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { PhChartBar, PhMagnifyingGlass, PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { apiBase } from '../config';
import type { PriceRow } from '../types';

/** Legacy startPricesAutoRefresh intervals. */
const REFRESH_MS = 5000;
const AGE_TICK_MS = 1000;

const { t } = useI18n();

const open = ref(false);
const rows = ref<PriceRow[]>([]);
const loading = ref(false);
const loadError = ref('');
/** Legacy po-search filter query. */
const query = ref('');
/** Legacy _pricesAgeTimer tick: re-renders the Age column every second. */
const nowTick = ref(0);

let refreshTimer: ReturnType<typeof setInterval> | undefined;
let ageTimer: ReturnType<typeof setInterval> | undefined;

/* ── Legacy filteredPriceRows (po-search symbol/exchange match) ── */

const displayRows = computed<PriceRow[]>(() => {
  void nowTick.value; // re-render the Age column on the 1s tick
  const q = query.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter(
    (r) =>
      String(r.symbol ?? '').toLowerCase().includes(q) || String(r.exchange ?? '').toLowerCase().includes(q)
  );
});

/* ── Legacy loadPricesOverlay ── */

async function loadPrices(opts: { silent?: boolean } = {}): Promise<void> {
  if (loading.value) return; // legacy _pricesLoading overlap guard
  loading.value = true;
  if (!opts.silent) {
    loadError.value = '';
    if (!rows.value.length) query.value = '';
  }
  try {
    const data = await apiFetch<{ rows?: PriceRow[] }>(`${apiBase()}/prices-snapshot`);
    rows.value = data.rows ?? [];
    loadError.value = '';
  } catch {
    if (!opts.silent) loadError.value = t('sysmon.failedLoadPrices');
  } finally {
    loading.value = false;
  }
}

/* ── Legacy openPricesOverlay/closePricesOverlay + auto refresh ── */

function startAutoRefresh(): void {
  stopAutoRefresh();
  refreshTimer = setInterval(() => void loadPrices({ silent: true }), REFRESH_MS);
  ageTimer = setInterval(() => {
    nowTick.value += 1;
  }, AGE_TICK_MS);
}

function stopAutoRefresh(): void {
  if (refreshTimer !== undefined) clearInterval(refreshTimer);
  if (ageTimer !== undefined) clearInterval(ageTimer);
  refreshTimer = undefined;
  ageTimer = undefined;
}

/** Legacy window.openPricesOverlay: show, reset the filter, start timers, load. */
function openOverlay(): void {
  open.value = true;
  query.value = '';
  startAutoRefresh();
  void loadPrices();
}

/** Legacy window.closePricesOverlay: stop timers and hide. */
function closeOverlay(): void {
  stopAutoRefresh();
  open.value = false;
}

/* ── Legacy title-bar drag ── */

const overlayEl = ref<HTMLElement | null>(null);
let dragging = false;
let dragOX = 0;
let dragOY = 0;

function onTitleMouseDown(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest('button')) return;
  const ov = overlayEl.value;
  if (!ov) return;
  const rect = ov.getBoundingClientRect();
  ov.style.transform = '';
  ov.style.left = `${rect.left}px`;
  ov.style.top = `${rect.top}px`;
  dragging = true;
  dragOX = event.clientX - rect.left;
  dragOY = event.clientY - rect.top;
  event.preventDefault();
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function onMove(event: MouseEvent): void {
  if (!dragging) return;
  const ov = overlayEl.value;
  if (!ov) return;
  ov.style.left = `${event.clientX - dragOX}px`;
  ov.style.top = `${event.clientY - dragOY}px`;
}

function onUp(): void {
  dragging = false;
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('mouseup', onUp);
}

onUnmounted(() => {
  stopAutoRefresh();
  onUp();
});

defineExpose({
  /** Legacy window.openPricesOverlay entry point. */
  open: openOverlay,
  /** Legacy window.closePricesOverlay. */
  close: closeOverlay,
});
</script>

<template>
  <div id="prices-overlay" ref="overlayEl" :class="{ active: open }">
    <div id="prices-overlay-title" @mousedown="onTitleMouseDown">
      <span><PbIcon :icon="PhChartBar" /> <span>{{ t('sysmon.priceSnapshot') }}</span></span>
      <div style="display: flex; gap: 0.4rem; align-items: center">
        <Button class="po-btn" variant="secondary" size="sm" type="button" :title="t('common.close')" :aria-label="t('common.close')" @click="closeOverlay"><PbIcon :icon="PhX" /></Button>
      </div>
    </div>
    <div style="padding: 0.4rem 0.75rem; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0">
      <label class="po-search-wrap" for="po-search"><PbIcon :icon="PhMagnifyingGlass" /><Input type="text" id="po-search" :placeholder="t('sysmon.filterSymbols')" :aria-label="t('sysmon.filterSymbols')" v-model="query" /></label>
    </div>
    <div id="prices-overlay-body">
      <div v-if="loading && !rows.length" class="po-note">{{ t('sysmon.loading') }}</div>
      <div v-else-if="loadError" class="po-error">{{ loadError }}</div>
      <div v-else-if="!displayRows.length" class="po-note">{{ t('sysmon.noPriceData') }}</div>
      <table v-else class="po-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{{ t('sysmon.symbol') }}</th>
            <th>{{ t('sysmon.exchange') }}</th>
            <th style="text-align: right">{{ t('sysmon.price') }}</th>
            <th style="text-align: right">{{ t('sysmon.age') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in displayRows" :key="i">
            <td style="color: var(--text-disabled)">{{ i + 1 }}</td>
            <td>{{ row.symbol }}</td>
            <td style="color: var(--text-muted)">{{ row.exchange || '' }}</td>
            <td style="text-align: right; color: var(--accent-soft); font-variant-numeric: tabular-nums">{{ fmtPrice(row.price) }}</td>
            <td :style="'text-align:right;color:' + ageCol(row.ts) + ';font-variant-numeric:tabular-nums;'">{{ fmtAge(row.ts) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (Prices overlay block). -->
<style scoped>
#prices-overlay {
  display: none;
  position: fixed;
  z-index: var(--z-modal);
  top: 12vh;
  left: 50%;
  transform: translateX(-50%);
  width: 540px;
  min-width: 280px;
  min-height: 180px;
  max-height: 80vh;
  background: var(--bg-page);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  box-shadow: var(--shadow-modal);
  flex-direction: column;
  resize: both;
  overflow: hidden;
}
#prices-overlay.active {
  display: flex;
}
#prices-overlay-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.55rem 0.85rem;
  background: var(--bg-page);
  border-radius: 10px 10px 0 0;
  border-bottom: 1px solid var(--border-subtle);
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}
#prices-overlay-title span {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-primary);
}
#prices-overlay-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.po-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-xs);
}
.po-table th {
  position: sticky;
  top: 0;
  background: var(--bg-page);
  color: var(--text-muted);
  padding: 0.35rem 0.75rem;
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}
.po-table td {
  padding: 0.25rem 0.75rem;
  border-bottom: 1px solid var(--bg-page);
  white-space: nowrap;
  color: var(--text-secondary);
}
.po-table tr:hover td {
  background: var(--bg-page);
}
.po-search-wrap {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--text-muted);
}
.po-note {
  color: var(--text-disabled);
  padding: 1rem;
}
.po-error {
  color: var(--danger-soft);
  padding: 1rem;
}
</style>
