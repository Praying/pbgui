<script setup lang="ts">
/**
 * LayoutPicker — port of buildLayoutPicker + updateActiveThumb
 * (dashboard_editor.html:2527-2631): 10 preset thumbs (rows 1-5 × cols 1-2),
 * grouped 1-col / 2-col with a separator, plus the amber cols×rows badge
 * shown only when no preset matches (custom sizes, e.g. 2×7 via the footer).
 */
import { computed } from 'vue';
import { useDashboardStore } from '../stores/dashboardStore';
import { LAYOUTS, isLayoutPreset, type LayoutPreset } from '../lib/grid';
import { dashT } from '../lib/i18n';

const store = useDashboardStore();

const oneCol = LAYOUTS.filter((l) => l.cols === 1);
const twoCol = LAYOUTS.filter((l) => l.cols === 2);

const presetMatched = computed<boolean>(() => isLayoutPreset(store.rows, store.cols));

function thumbStyle(lt: LayoutPreset): Record<string, string> {
  return {
    gridTemplateColumns: lt.cols === 2 ? '1fr 1fr' : '1fr',
    gridTemplateRows: 'repeat(' + lt.rows + ', 1fr)',
  };
}

function isActive(lt: LayoutPreset): boolean {
  return store.rows === lt.rows && store.cols === lt.cols;
}

function pick(lt: LayoutPreset): void {
  store.setLayout(lt.rows, lt.cols);
}
</script>

<template>
  <div class="layout-picker flex flex-wrap items-end gap-[0.4rem]">
    <div class="lt-group flex flex-col gap-[0.25rem]">
      <div class="lt-lbl pb-[0.1rem] text-xs uppercase tracking-[0.04em] text-secondary whitespace-nowrap">{{ dashT('dash.oneCol', '1 COL') }}</div>
      <div class="lt-thumbs flex gap-[0.3rem]">
        <div
          v-for="lt in oneCol"
          :key="'lt-1-' + lt.rows"
          class="lt-thumb grid h-[34px] w-[44px] shrink-0 cursor-pointer gap-0.5 rounded-sm border p-1 [transition:border-color_.15s,background_.15s] hover:border-accent-soft hover:bg-elevated"
          :class="isActive(lt) ? 'active border-accent-deep bg-accent/22' : 'border-secondary bg-border-default'"
          :data-rows="lt.rows"
          :data-cols="lt.cols"
          :style="thumbStyle(lt)"
          :title="lt.cols + '×' + lt.rows"
          @click="pick(lt)"
        >
          <div
            v-for="i in lt.cols * lt.rows"
            :key="i"
            class="lt-cell min-h-0 rounded-[1px]"
            :class="isActive(lt) ? 'bg-accent/60' : 'bg-border-default'"
          ></div>
        </div>
      </div>
    </div>
    <div class="lt-sep mx-[0.1rem] w-px self-stretch bg-border-default"></div>
    <div class="lt-group flex flex-col gap-[0.25rem]">
      <div class="lt-lbl pb-[0.1rem] text-xs uppercase tracking-[0.04em] text-secondary whitespace-nowrap">{{ dashT('dash.twoCols', '2 COLS') }}</div>
      <div class="lt-thumbs flex gap-[0.3rem]">
        <div
          v-for="lt in twoCol"
          :key="'lt-2-' + lt.rows"
          class="lt-thumb grid h-[34px] w-[44px] shrink-0 cursor-pointer gap-0.5 rounded-sm border p-1 [transition:border-color_.15s,background_.15s] hover:border-accent-soft hover:bg-elevated"
          :class="isActive(lt) ? 'active border-accent-deep bg-accent/22' : 'border-secondary bg-border-default'"
          :data-rows="lt.rows"
          :data-cols="lt.cols"
          :style="thumbStyle(lt)"
          :title="lt.cols + '×' + lt.rows"
          @click="pick(lt)"
        >
          <div
            v-for="i in lt.cols * lt.rows"
            :key="i"
            class="lt-cell min-h-0 rounded-[1px]"
            :class="isActive(lt) ? 'bg-accent/60' : 'bg-border-default'"
          ></div>
        </div>
      </div>
    </div>
    <span
      class="lt-dim h-[34px] w-[44px] items-center justify-center rounded-sm border border-warning-soft bg-warning/14 text-center text-[0.6rem] font-semibold leading-[34px] text-warning-soft whitespace-nowrap"
      :style="{ display: presetMatched ? 'none' : 'inline-flex' }"
    >
      {{ store.cols }}×{{ store.rows }}
    </span>
  </div>
</template>
