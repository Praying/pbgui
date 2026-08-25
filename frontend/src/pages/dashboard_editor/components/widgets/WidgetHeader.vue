<script setup lang="ts">
/**
 * WidgetHeader — the shared widget chrome bar: icon + title + meta slot +
 * edit-mode trash, in the legacy DOM order (render.js:406-421 _decorateHeader
 * + the 4× duplicated header blocks of buildTop/buildPnl/buildAdg/buildPpl):
 *
 *   [icon] [title] [meta slot (controls/static)] [trash]
 *
 * The .dt-header is the cell's drag source (legacy _attachViewDrag,
 * editor:2160-2179 — the inject comes from GridCell) and the trash button is
 * the edit-mode delete affordance (legacy _makeDeleteCb, editor:1021-1024 →
 * store.clearCell: clearCellKeys + epoch bump + sync).
 */
import { computed, inject } from 'vue';
import { Button } from '@/shared/components/ui/button';
import { useDashboardStore } from '../../stores/dashboardStore';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { dashT } from '../../lib/i18n';
import { dtHeaderClass, dtIconClass, dtTitleClass, dtTrashClass } from './uiClasses';

defineProps<{
  title: string;
  /** Legacy _widgetIcon(type) emoji — null omits the icon span. */
  icon: string | null;
}>();

const store = useDashboardStore();
const ctx = inject(cellContextKey, null);
const drag = inject(widgetDragKey, null);

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
    <span v-if="icon" :class="dtIconClass">{{ icon }}</span>
    <span :class="dtTitleClass">{{ title }}</span>
    <slot />
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
