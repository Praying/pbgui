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
  <div id="widget-palette" class="widget-palette flex min-w-[80px] flex-auto flex-wrap items-center gap-[0.4rem]">
    <span class="palette-label mr-[0.25rem] shrink-0 select-none text-xs uppercase tracking-[0.06em] text-secondary">{{ dashT('dash.widgets', 'Widgets') }}</span>
    <div id="palette-items" class="palette-items flex flex-wrap gap-[0.4rem]">
      <div
        v-for="type in PALETTE_TYPES"
        :key="type"
        class="palette-item flex cursor-grab select-none items-center gap-[0.3rem] rounded-md border border-secondary bg-border-default px-[0.6rem] py-[0.3rem] text-sm whitespace-nowrap text-primary [transition:border-color_.15s,background_.15s,transform_.1s,box-shadow_.15s] hover:border-accent-soft hover:bg-elevated hover:-translate-y-px hover:shadow-[0_2px_8px_rgb(var(--accent-rgb)/0.15)] active:cursor-grabbing"
        :class="draggingType === type ? 'dragging opacity-40' : ''"
        draggable="true"
        :data-widget-type="type"
        @dragstart="onDragStart($event, type)"
        @dragend="onDragEnd"
      >
        <span class="pi-icon inline-block shrink-0 text-sm leading-none">{{ WIDGET_META[type].icon }}</span>
        <span>{{ widgetLabel(type) }}</span>
      </div>
    </div>
  </div>
</template>
