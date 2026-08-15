<script setup lang="ts">
/**
 * PaletteBar — port of buildPalette (dashboard_editor.html:556-582): the
 * widget palette items are the HTML5 drag sources for palette→cell drops.
 * dragstart sets `effectAllowed='copy'` + the `widget-type` data channel
 * (the drop dispatcher's palette-copy signal); dragend removes the dragging
 * class and clears every cell's drag-over marker (editor:574-579).
 */
import { ref } from 'vue';
import { useCellDrag } from '../composables/useCellDrag';
import { PALETTE_TYPES, WIDGET_META, widgetLabel, type RenderableWidgetType } from '../lib/grid';
import { dashT } from '../lib/i18n';

const drag = useCellDrag();
const draggingType = ref<RenderableWidgetType | null>(null);

function onDragStart(e: DragEvent, type: RenderableWidgetType): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('widget-type', type);
  draggingType.value = type;
}

function onDragEnd(): void {
  draggingType.value = null;
  drag.clearDragOver();
}
</script>

<template>
  <div id="widget-palette" class="widget-palette">
    <span class="palette-label">{{ dashT('dash.widgets', 'Widgets') }}</span>
    <div id="palette-items" class="palette-items">
      <div
        v-for="type in PALETTE_TYPES"
        :key="type"
        class="palette-item"
        :class="{ dragging: draggingType === type }"
        draggable="true"
        :data-widget-type="type"
        @dragstart="onDragStart($event, type)"
        @dragend="onDragEnd"
      >
        <span class="pi-icon">{{ WIDGET_META[type].icon }}</span>
        <span>{{ widgetLabel(type) }}</span>
      </div>
    </div>
  </div>
</template>
