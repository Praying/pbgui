<script setup lang="ts">
/**
 * EmptyCell — interim widget stub (recon: "D-2 ships EmptyCell stubs; each
 * widget task replaces its stub"). D-editor-4..7 register their real widget
 * components via registerWidget().
 *
 * Renders the widget's chrome bar the way legacy widgets do: a `.dt-header`
 * (icon + title + trash in edit mode) that is the cell's drag source — the
 * port of `_attachViewDrag` + `_decorateHeader` (editor:2160-2179,
 * render.js:406-421). The trash button is the edit-mode delete affordance
 * (legacy onDelete → clearCell, editor:1021-1024).
 */
import { computed, inject } from 'vue';
import { Button } from '@/shared/components/ui/button';
import { useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { WIDGET_META, widgetLabel, type RenderableWidgetType } from '../../lib/grid';
import { dashT } from '../../lib/i18n';
import type { WidgetType } from '../../types/widgets';
import { dtHeaderClass, dtIconClass, dtTitleClass, dtTrashClass } from './uiClasses';

const store = useDashboardStore();
const ctx = inject(cellContextKey, null);
const drag = inject(widgetDragKey, null);

/* GridCell only mounts this for renderable types, so the raw persisted
   string is one of them (legacy meta lookup parity). */
const type = computed<WidgetType>(() =>
  ctx ? (store.cellType(ctx.row, ctx.col) as WidgetType) : 'NONE'
);

const icon = computed<string>(() => WIDGET_META[type.value as RenderableWidgetType]?.icon ?? '');
const label = computed<string>(() => widgetLabel(type.value));
const editMode = computed<boolean>(() => !store.config.viewOnly);

function onDelete(): void {
  if (!ctx) return;
  /* legacy _makeDeleteCb: clearCell + rebuild + scheduleSync */
  store.clearCell(ctx.row, ctx.col);
}
</script>

<template>
  <div
    :class="dtHeaderClass"
    draggable="true"
    @dragstart="drag?.onHeaderDragStart($event)"
    @dragend="drag?.onHeaderDragEnd()"
  >
    <span :class="dtIconClass">{{ icon }}</span>
    <span :class="dtTitleClass">{{ label }}</span>
    <Button
      v-if="editMode"
      type="button"
      variant="ghost"
      size="icon"
      :class="dtTrashClass"
      :title="dashT('dash.removeWidget', 'Remove widget')"
      @click.stop="onDelete"
    >
      &#128465;
    </Button>
  </div>
</template>
