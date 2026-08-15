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
  <div class="layout-picker">
    <div class="lt-group">
      <div class="lt-lbl">{{ dashT('dash.oneCol', '1 COL') }}</div>
      <div class="lt-thumbs">
        <div
          v-for="lt in oneCol"
          :key="'lt-1-' + lt.rows"
          class="lt-thumb"
          :class="{ active: isActive(lt) }"
          :data-rows="lt.rows"
          :data-cols="lt.cols"
          :style="thumbStyle(lt)"
          :title="lt.cols + '×' + lt.rows"
          @click="pick(lt)"
        >
          <div v-for="i in lt.cols * lt.rows" :key="i" class="lt-cell"></div>
        </div>
      </div>
    </div>
    <div class="lt-sep"></div>
    <div class="lt-group">
      <div class="lt-lbl">{{ dashT('dash.twoCols', '2 COLS') }}</div>
      <div class="lt-thumbs">
        <div
          v-for="lt in twoCol"
          :key="'lt-2-' + lt.rows"
          class="lt-thumb"
          :class="{ active: isActive(lt) }"
          :data-rows="lt.rows"
          :data-cols="lt.cols"
          :style="thumbStyle(lt)"
          :title="lt.cols + '×' + lt.rows"
          @click="pick(lt)"
        >
          <div v-for="i in lt.cols * lt.rows" :key="i" class="lt-cell"></div>
        </div>
      </div>
    </div>
    <span class="lt-dim" :style="{ display: presetMatched ? 'none' : 'inline-flex' }">
      {{ store.cols }}×{{ store.rows }}
    </span>
  </div>
</template>
