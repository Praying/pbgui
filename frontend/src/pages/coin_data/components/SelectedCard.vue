<script setup lang="ts">
/*
 * The selected-row details card — legacy #selected-card (:1513-1530) with
 * renderSelectedRow (:2781-2836), fitSelectedCardToContent (:2742-2779),
 * the drag handle (:2946-2981), the eight resize handles (:2983-3058) and
 * the viewport reset on window resize (:3061-3069). Vue renders the field
 * grid; the layout machinery stays imperative (it measures live DOM).
 */
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatCompact, formatPrice, formatRatio } from '../lib/format';

const props = defineProps<{
  row: Record<string, unknown> | null;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();

const cardEl = useTemplateRef<HTMLDivElement>('card');
const headEl = useTemplateRef<HTMLDivElement>('head');
const gridEl = useTemplateRef<HTMLDivElement>('grid');

interface DetailField {
  label: string;
  value: string;
  wide?: boolean;
  wrap?: boolean;
}

/** The legacy field matrix (:2806-2823). */
function detailFields(row: Record<string, unknown>): DetailField[] {
  const dash = (value: unknown) => (value == null ? '-' : String(value));
  return [
    { label: t('market.ccxtSymbol'), value: dash(row.ccxt_symbol || row.symbol) },
    { label: t('market.base'), value: dash(row.base) },
    { label: t('market.quote'), value: dash(row.quote) },
    { label: t('market.cmcId'), value: dash(row.cmc_id) },
    { label: t('market.cmcRank'), value: dash(row.cmc_rank) },
    { label: t('market.price'), value: formatPrice(row.price) },
    { label: t('market.marketCapLabel'), value: formatCompact(row.market_cap) },
    { label: t('market.volume24h'), value: formatCompact(row.volume_24h) },
    { label: 'vol/mcap', value: formatRatio(row.vol_mcap) },
    { label: t('market.contractSize'), value: dash(row.contract_size) },
    { label: t('market.minAmount'), value: dash(row.min_amount) },
    { label: t('market.minCost'), value: dash(row.min_cost) },
    { label: t('market.precisionAmount'), value: dash(row.precision_amount) },
    { label: t('market.maxLeverage'), value: dash(row.max_leverage) },
    { label: t('market.minOrderPrice'), value: dash(row.min_order_price) },
    { label: t('market.tags'), value: ((row.tags as string[]) || []).join(', ') || '-', wide: true, wrap: true },
  ];
}

const fields = ref<DetailField[]>([]);
const title = ref('');
const cmcLink = ref('');
const notice = ref('');

function syncFields(): void {
  const row = props.row;
  if (!row) {
    fields.value = [];
    title.value = '';
    cmcLink.value = '';
    notice.value = '';
    return;
  }
  fields.value = detailFields(row);
  title.value = String(row.coin || row.symbol || row.ccxt_symbol || t('market.selectedSymbol')); // :2796
  cmcLink.value = String(row.cmc_link || ''); // :2798-2804
  notice.value = String(row.notice || '');
}

/** resetSelectedCardLayout (:2730-2740). */
function resetLayout(): void {
  const card = cardEl.value;
  if (!card) return;
  delete card.dataset.layoutMode;
  card.style.left = '';
  card.style.top = '';
  card.style.right = '';
  card.style.bottom = '';
  card.style.width = '';
  card.style.height = '';
  card.style.transform = '';
}

/** fitSelectedCardToContent (:2742-2779). */
function fitToContent(): void {
  const card = cardEl.value;
  const head = headEl.value;
  const grid = gridEl.value;
  if (!card || !head || !grid) return;
  if (!props.visible) return;
  if (window.innerWidth <= 980) return;
  if (card.dataset.layoutMode === 'manual') return;

  const minWidth = parseFloat(window.getComputedStyle(card).minWidth) || 520;
  const minHeight = parseFloat(window.getComputedStyle(card).minHeight) || 280;
  const maxWidth = Math.max(minWidth, Math.min(window.innerWidth - 16, 1120));
  const maxHeight = Math.max(minHeight, window.innerHeight - 88);
  const widthCandidates = [640, 760, 900, maxWidth]
    .map((value) => Math.max(minWidth, Math.min(maxWidth, value)))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left - right);

  card.style.width = widthCandidates[widthCandidates.length - 1] + 'px';
  card.style.height = 'auto';

  let targetWidth = widthCandidates[widthCandidates.length - 1] || maxWidth;
  let targetHeight = maxHeight;
  widthCandidates.some((candidateWidth) => {
    card.style.width = candidateWidth + 'px';
    const contentHeight = Math.ceil(head.offsetHeight + grid.scrollHeight + 2);
    if (contentHeight <= maxHeight) {
      targetWidth = candidateWidth;
      targetHeight = Math.max(minHeight, contentHeight);
      return true;
    }
    targetWidth = candidateWidth;
    targetHeight = Math.min(maxHeight, Math.max(minHeight, contentHeight));
    return false;
  });

  card.style.width = targetWidth + 'px';
  card.style.height = targetHeight + 'px';
}

/* ── drag (head mousedown :2946-2981) ── */

function onHeadMousedown(event: MouseEvent): void {
  const card = cardEl.value;
  if (!card) return;
  if (event.button !== 0) return;
  if (window.innerWidth <= 980) return;
  if ((event.target as HTMLElement).closest('.details-actions')) return;
  event.preventDefault();
  card.dataset.layoutMode = 'manual';
  const rect = card.getBoundingClientRect();
  card.style.transform = 'none';
  card.style.left = rect.left + 'px';
  card.style.top = rect.top + 'px';
  card.style.width = rect.width + 'px';
  card.style.height = rect.height + 'px';
  const startX = event.clientX;
  const startY = event.clientY;
  const boxLeft = rect.left;
  const boxTop = rect.top;
  const boxWidth = rect.width;
  const boxHeight = rect.height;

  function onMove(moveEvent: MouseEvent): void {
    const el = card; // non-null after the entry guard
    if (!el) return;
    const maxLeft = Math.max(8, window.innerWidth - boxWidth - 8);
    const maxTop = Math.max(56, window.innerHeight - boxHeight - 8);
    const nextLeft = Math.min(Math.max(8, boxLeft + moveEvent.clientX - startX), maxLeft);
    const nextTop = Math.min(Math.max(56, boxTop + moveEvent.clientY - startY), maxTop);
    el.style.left = nextLeft + 'px';
    el.style.top = nextTop + 'px';
  }

  function onUp(): void {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ── resize (handles :2983-3058) ── */

function onResizeMousedown(event: MouseEvent, direction: string): void {
  const card = cardEl.value;
  if (!card) return;
  if (event.button !== 0) return;
  if (window.innerWidth <= 980) return;
  event.preventDefault();
  event.stopPropagation();
  card.dataset.layoutMode = 'manual';

  const rect = card.getBoundingClientRect();
  const startClientX = event.clientX;
  const startClientY = event.clientY;
  const startLeft = rect.left;
  const startTop = rect.top;
  const startWidth = rect.width;
  const startHeight = rect.height;
  const minWidth = parseFloat(window.getComputedStyle(card).minWidth) || 520;
  const minHeight = parseFloat(window.getComputedStyle(card).minHeight) || 280;

  card.style.transform = 'none';
  card.style.left = rect.left + 'px';
  card.style.top = rect.top + 'px';
  card.style.width = rect.width + 'px';
  card.style.height = rect.height + 'px';

  function onResize(moveEvent: MouseEvent): void {
    const el = card; // non-null after the entry guard
    if (!el) return;
    const dx = moveEvent.clientX - startClientX;
    const dy = moveEvent.clientY - startClientY;
    let nextLeft = startLeft;
    let nextTop = startTop;
    let nextWidth = startWidth;
    let nextHeight = startHeight;

    if (direction.includes('right')) {
      nextWidth = Math.max(minWidth, startWidth + dx);
      nextWidth = Math.min(nextWidth, window.innerWidth - startLeft - 8);
    }
    if (direction.includes('left')) {
      nextWidth = Math.max(minWidth, startWidth - dx);
      nextLeft = startLeft + (startWidth - nextWidth);
      if (nextLeft < 8) {
        nextLeft = 8;
        nextWidth = startLeft + startWidth - nextLeft;
      }
    }
    if (direction.includes('bottom')) {
      nextHeight = Math.max(minHeight, startHeight + dy);
      nextHeight = Math.min(nextHeight, window.innerHeight - startTop - 8);
    }
    if (direction.includes('top')) {
      nextHeight = Math.max(minHeight, startHeight - dy);
      nextTop = startTop + (startHeight - nextHeight);
      if (nextTop < 56) {
        nextTop = 56;
        nextHeight = startTop + startHeight - nextTop;
      }
    }

    nextWidth = Math.max(minWidth, nextWidth);
    nextHeight = Math.max(minHeight, nextHeight);

    el.style.left = nextLeft + 'px';
    el.style.top = nextTop + 'px';
    el.style.width = nextWidth + 'px';
    el.style.height = nextHeight + 'px';
  }

  function onResizeEnd(): void {
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', onResizeEnd);
  }

  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', onResizeEnd);
}

function onWindowResize(): void {
  if (window.innerWidth <= 980) {
    resetLayout();
    return;
  }
  fitToContent();
}

function openCmcLink(event: MouseEvent): void {
  const href = cmcLink.value;
  if (!href || href === '#') {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  try {
    window.open(href, '_blank', 'noopener,noreferrer'); // :3071-3083
  } catch {
    /* ignore */
  }
}

watch(
  () => [props.row, props.visible] as const,
  () => {
    syncFields();
    if (props.row && props.visible) {
      void nextTick(fitToContent);
    } else {
      resetLayout();
    }
  },
  { immediate: true }
);

onMounted(() => window.addEventListener('resize', onWindowResize));
onBeforeUnmount(() => window.removeEventListener('resize', onWindowResize));

defineExpose({ fitToContent, resetLayout });
</script>

<template>
  <section
    ref="card"
    id="selected-card"
    class="details-card"
    :class="{ visible: visible && !!row }"
  >
    <div class="details-resize-handle side-top" data-resize="top" @mousedown="onResizeMousedown($event, 'top')"></div>
    <div class="details-resize-handle side-right" data-resize="right" @mousedown="onResizeMousedown($event, 'right')"></div>
    <div class="details-resize-handle side-bottom" data-resize="bottom" @mousedown="onResizeMousedown($event, 'bottom')"></div>
    <div class="details-resize-handle side-left" data-resize="left" @mousedown="onResizeMousedown($event, 'left')"></div>
    <div class="details-resize-handle corner corner-top-left" data-resize="top-left" @mousedown="onResizeMousedown($event, 'top-left')"></div>
    <div class="details-resize-handle corner corner-top-right" data-resize="top-right" @mousedown="onResizeMousedown($event, 'top-right')"></div>
    <div class="details-resize-handle corner corner-bottom-right" data-resize="bottom-right" @mousedown="onResizeMousedown($event, 'bottom-right')"></div>
    <div class="details-resize-handle corner corner-bottom-left" data-resize="bottom-left" @mousedown="onResizeMousedown($event, 'bottom-left')"></div>
    <div ref="head" class="details-head" @mousedown="onHeadMousedown">
      <div class="details-title" id="selected-title">{{ title || t('market.selectedSymbol') }}</div>
      <div class="details-actions">
        <a
          v-if="cmcLink"
          class="details-link"
          id="selected-cmc-link"
          :href="cmcLink"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('market.openOnCoinMarketCap')"
          @click="openCmcLink"
        >{{ t('market.openCmc') }}</a>
        <button class="details-close" id="btn-close-details" type="button" :title="t('market.closeDetails')" @click="emit('close')">&#x2715;</button>
      </div>
    </div>
    <div ref="grid" class="details-grid" id="selected-grid">
      <div v-for="field in fields" :key="field.label" :class="field.wide ? 'kv wide' : 'kv'">
        <div class="kv-label">{{ field.label }}</div>
        <div :class="field.wrap ? 'kv-value wrap' : 'kv-value'" :title="field.value">{{ field.value }}</div>
      </div>
      <div v-if="notice" class="notice-box"><strong>{{ t('market.notice') }}</strong><br>{{ notice }}</div>
    </div>
  </section>
</template>
