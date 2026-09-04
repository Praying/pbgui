<script setup lang="ts">
/*
 * The floating specs window — legacy #tradfi-specs-window
 * (market_data_main.html:3149-3166) + initTradfiSpecsWindow (:5963-6110):
 * header drag (:5979-6015), 8-direction resize (:6017-6091), Escape close
 * (:5973-5977), viewport re-clamp (:6093-6109), the specs table
 * (:5904-5940) and the search content (:5812-5902 → SearchResults).
 * Geometry math lives in lib/tradfiWindow.ts. Rendered only while a
 * window mode is active (legacy toggled .visible — :5948-5961).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import type { UseTradfiMap } from '../../composables/useTradfiMap';
import {
  RESIZE_DIRECTIONS,
  clampDragPosition,
  clampRectToViewport,
  isMobileViewport,
  resizeRect,
  type ResizeDirection,
  type WindowRect,
} from '../../lib/tradfiWindow';
import SearchResults from './SearchResults.vue';

const props = defineProps<{
  map: UseTradfiMap;
}>();

const { t } = useI18n();

/** null = the CSS default dock (top:84px right:18px). */
const rect = ref<WindowRect | null>(null);
const panelEl = ref<HTMLElement | null>(null);

const isVisible = computed(() => props.map.windowMode.value !== '');

const title = computed(() =>
  props.map.windowMode.value === 'search'
    ? t('market.searchTiingoTicker') // :5822
    : t('market.xyzSpecs') // :5907 + :5958
);
const subtitle = computed(() =>
  props.map.windowMode.value === 'search'
    ? t('market.searchTiingoSubtitle') // :5822
    : t('market.floatingCacheViewer')
);

const windowStyle = computed(() => {
  if (!rect.value) return undefined; // CSS defaults (:2450-2457)
  const r = rect.value;
  return {
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    right: 'auto', // :5992 undock
    transform: 'none', // :5993
  } as Record<string, string>;
});

function viewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Freeze the current CSS rect into inline styles (:5984-5997 / :6035-6040). */
function captureRect(): void {
  const el = panelEl.value;
  if (!el) return;
  const box = el.getBoundingClientRect();
  rect.value = { left: box.left, top: box.top, width: box.width, height: box.height };
}

function onHeaderMousedown(event: MouseEvent): void {
  if (event.button !== 0) return; // :5980
  if (isMobileViewport(viewport())) return; // :5981
  if ((event.target as Element).closest('button')) return; // :5982
  event.preventDefault(); // :5983
  captureRect();
  const start = rect.value;
  if (!start) return;
  const startX = event.clientX;
  const startY = event.clientY;

  const onMove = (moveEvent: MouseEvent): void => {
    const next = clampDragPosition(
      { left: start.left + moveEvent.clientX - startX, top: start.top + moveEvent.clientY - startY },
      start.width,
      start.height,
      viewport()
    ); // :6000-6005
    rect.value = { ...start, ...next };
  };
  const onUp = (): void => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function onResizeMousedown(direction: ResizeDirection, event: MouseEvent): void {
  if (event.button !== 0) return; // :6019
  if (isMobileViewport(viewport())) return; // :6020
  event.preventDefault(); // :6021
  event.stopPropagation(); // :6022
  captureRect();
  const start = rect.value;
  if (!start) return;
  const startX = event.clientX;
  const startY = event.clientY;

  const onResize = (moveEvent: MouseEvent): void => {
    rect.value = resizeRect(
      direction,
      start,
      { dx: moveEvent.clientX - startX, dy: moveEvent.clientY - startY },
      viewport()
    ); // :6042-6081
  };
  const onResizeEnd = (): void => {
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', onResizeEnd);
  };
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', onResizeEnd);
}

/** Escape close (:5973-5977). */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && isVisible.value) props.map.closeWindow();
}

/** Viewport re-clamp (:6093-6109). */
function onViewportResize(): void {
  if (!isVisible.value) return; // :6094
  if (isMobileViewport(viewport())) {
    rect.value = null; // :6096-6101 — back to the CSS layout
    return;
  }
  if (!rect.value) return;
  const el = panelEl.value;
  if (el) {
    // read the live rect (drag may have been clamped differently)
    const box = el.getBoundingClientRect();
    rect.value = clampRectToViewport(
      { left: box.left, top: box.top, width: box.width, height: box.height },
      viewport()
    );
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', onViewportResize, { passive: true });
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', onViewportResize);
});

/** Specs table rows (:5909). */
const specRows = computed(() => {
  const rows = props.map.specsPayload.value?.rows;
  return Array.isArray(rows)
    ? rows.filter((row): row is Record<string, string> => Boolean(row))
    : [];
});

/** :5917 — fetched_at formatting. */
const fetchedAtText = computed(() => {
  const raw = props.map.specsPayload.value?.fetched_at;
  if (!raw) return t('market.unknownTime');
  return String(raw).replace('T', ' ').slice(0, 19) + ' UTC';
});

/** The former .tradfi-specs-resize-{dir} rules — the legacy template built
 *  the class name dynamically; a mapping returns the complete set per
 *  direction, 'tradfi-specs-resize-{dir}' riding along as the anchor
 *  (tests + the mousedown wiring key on it). */
const RESIZE_HANDLE: Record<ResizeDirection, string> = {
  n: 'top-[-4px] left-1.5 right-1.5 h-2 cursor-n-resize',
  s: 'bottom-[-4px] left-1.5 right-1.5 h-2 cursor-s-resize',
  w: 'left-[-4px] top-1.5 bottom-1.5 w-2 cursor-w-resize',
  e: 'right-[-4px] top-1.5 bottom-1.5 w-2 cursor-e-resize',
  nw: 'top-[-4px] left-[-4px] h-3 w-3 cursor-nw-resize',
  ne: 'top-[-4px] right-[-4px] h-3 w-3 cursor-ne-resize',
  sw: 'bottom-[-4px] left-[-4px] h-3 w-3 cursor-sw-resize',
  se: 'bottom-[-4px] right-[-4px] h-3 w-3 cursor-se-resize',
};

function resizeHandleClass(direction: ResizeDirection): string {
  return `tradfi-specs-resize tradfi-specs-resize-${direction} absolute z-[2] ${RESIZE_HANDLE[direction]}`;
}
</script>

<template>
  <div
    v-if="isVisible"
    id="tradfi-specs-window"
    ref="panelEl"
    class="tradfi-specs-window visible fixed top-[84px] right-[18px] z-[var(--z-dropdown)] flex h-[min(72vh,760px)] min-h-[320px] w-[min(1080px,calc(100vw-36px))] min-w-[520px] flex-col overflow-hidden rounded-xl border border-accent/26 bg-page shadow-[0_22px_72px_rgba(5,8,14,0.55)] max-[700px]:top-[62px] max-[700px]:right-2 max-[700px]:left-2 max-[700px]:h-[calc(100dvh-76px)] max-[700px]:max-h-none max-[700px]:w-auto max-[700px]:min-h-0 max-[700px]:min-w-0"
    :style="windowStyle"
    aria-hidden="false"
  >
    <div
      v-for="direction in RESIZE_DIRECTIONS"
      :key="direction"
      :class="resizeHandleClass(direction)"
      :data-dir="direction"
      @mousedown="onResizeMousedown(direction, $event)"
    ></div>
    <div
      id="tradfi-specs-window-header"
      class="tradfi-specs-window-header flex flex-shrink-0 cursor-move items-center justify-between gap-3 border-b border-border-subtle bg-card pt-3 pr-[28px] pb-3 pl-5 select-none"
      @mousedown="onHeaderMousedown"
    >
      <div>
        <div class="tradfi-specs-window-title text-md font-bold text-primary" id="tradfi-specs-window-title">{{ title }}</div>
        <div class="tradfi-specs-window-subtitle text-sm text-secondary" id="tradfi-specs-window-subtitle">{{ subtitle }}</div>
      </div>
      <Button
        class="tradfi-specs-window-close text-lg leading-none"
        variant="ghost"
        size="sm"
        id="btn-tradfi-specs-close"
        type="button"
        :aria-label="t('market.closeSpecsWindow')"
        @click="map.closeWindow()"
      >✕</Button>
    </div>
    <div id="tradfi-specs-view" class="tradfi-specs-window-body min-h-0 flex-1 overflow-auto bg-page/94 p-3 max-[700px]:p-2">
      <SearchResults v-if="map.windowMode.value === 'search'" :map="map" />
      <template v-else>
        <div v-if="map.specsLoadingMessage.value" class="tradfi-specs-window-empty flex h-full items-center justify-center text-sm text-secondary">
          {{ map.specsLoadingMessage.value }}
        </div>
        <div v-else-if="!specRows.length" class="tradfi-specs-window-empty flex h-full items-center justify-center text-sm text-secondary">
          {{ t('market.noXyzSpecs') }}
        </div>
        <div v-else class="tradfi-specs-window-content flex min-h-full flex-col gap-3">
          <div class="tradfi-specs-window-meta flex flex-wrap items-center justify-between gap-3 text-sm text-secondary">
            <div class="tradfi-search-meta text-sm text-secondary">{{ fetchedAtText }}</div>
            <div class="tradfi-search-meta text-sm text-secondary">{{ t('market.rowsCount', { count: specRows.length }) }}</div>
          </div>
          <div class="tradfi-specs-table-wrap min-h-0 max-h-none flex-1 overflow-auto rounded-[10px] border border-secondary/14 bg-page/48">
            <table class="tradfi-specs-table w-full border-collapse">
              <thead class="sticky top-0 z-[1] bg-page">
                <tr>
                  <th class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ t('market.xyz') }}</th>
                  <th class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ t('market.type') }}</th>
                  <th class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ t('market.description') }}</th>
                  <th class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ t('market.pyth') }}</th>
                  <th class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ t('market.hl') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in specRows" :key="index">
                  <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm"><strong>{{ row.xyz_coin }}</strong></td>
                  <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ row.canonical_type }}</td>
                  <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ row.description || row.instrument_label }}</td>
                  <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">
                    <a v-if="row.pyth_link" :href="row.pyth_link" target="_blank" rel="noopener noreferrer">
                      {{ t('market.openPyth') }}
                    </a>
                  </td>
                  <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">
                    <a v-if="row.hl_link" :href="row.hl_link" target="_blank" rel="noopener noreferrer">
                      {{ t('market.openHl') }}
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
