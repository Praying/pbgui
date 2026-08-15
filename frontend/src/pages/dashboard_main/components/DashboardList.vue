<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Legacy #sidebar-list-wrap (dashboard_main.html buildList/renderList +
 * applySidebarDragAt/onSidebarDragMove/onSidebarDragUp + list click/mousedown/
 * keydown delegation):
 * - empty list → dash.noDashboards, filtered-to-empty → dash.noMatch
 * - active class for the current dashboard, selected for multi-select
 * - edit icon (✎, dash.edit) on hover for the current dashboard in view mode
 * - plain click selects and loads, ctrl/meta click toggles selection
 * - left-button drag past 5px rubber-band selects (add/remove by start item)
 * - Enter selects and loads, Space toggles selection
 */
const props = defineProps<{
  dashboards: string[];
  names: string[];
  current: string;
  selected: string[];
  editMode: boolean;
}>();

const emit = defineEmits<{
  select: [name: string];
  toggle: [name: string];
  'set-selected': [name: string, isSelected: boolean];
  edit: [];
}>();

const { t } = useI18n();
const listWrap = ref<HTMLElement | null>(null);

/** Legacy sidebarDrag state. */
let drag: { name: string; x: number; y: number; selecting: boolean; mode: 'add' | 'remove' } | null = null;
/** Legacy sidebarSuppressClick. */
let suppressClick = false;

function itemNameAt(x: number, y: number): string | null {
  const hit = document.elementFromPoint(x, y);
  const item = hit instanceof Element ? hit.closest('.sb-item') : null;
  if (!item || !listWrap.value?.contains(item)) return null;
  return item.getAttribute('data-name');
}

function onMousedown(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const item = target.closest('.sb-item');
  if (!item || event.button !== 0 || target.closest('.sb-item-edit-icon')) return;
  event.preventDefault();
  const name = item.getAttribute('data-name') ?? '';
  drag = {
    name,
    x: event.clientX,
    y: event.clientY,
    selecting: false,
    mode: props.selected.includes(name) ? 'remove' : 'add',
  };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragUp);
}

function onDragMove(event: MouseEvent): void {
  if (!drag) return;
  if (
    !drag.selecting &&
    Math.max(Math.abs(event.clientX - drag.x), Math.abs(event.clientY - drag.y)) > 5
  ) {
    drag.selecting = true;
    emit('set-selected', drag.name, drag.mode === 'add');
  }
  if (!drag.selecting) return;
  event.preventDefault();
  const name = itemNameAt(event.clientX, event.clientY);
  if (name) emit('set-selected', name, drag.mode === 'add');
}

function onDragUp(): void {
  if (!drag) return;
  suppressClick = true;
  if (!drag.selecting) emit('select', drag.name);
  drag = null;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragUp);
  setTimeout(() => {
    suppressClick = false;
  }, 0);
}

function onClick(event: MouseEvent): void {
  if (suppressClick) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.sb-item-edit-icon')) {
    event.stopPropagation();
    emit('edit');
    return;
  }
  const item = target.closest('.sb-item');
  if (!item) return;
  const name = item.getAttribute('data-name');
  if (!name) return;
  if (event.ctrlKey || event.metaKey) {
    emit('toggle', name);
    return;
  }
  emit('select', name);
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const item = target.closest('.sb-item');
  if (!item) return;
  const name = item.getAttribute('data-name');
  if (!name) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    emit('select', name);
    return;
  }
  if (event.key === ' ') {
    event.preventDefault();
    emit('toggle', name);
  }
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragUp);
});
</script>

<template>
  <div
    id="sidebar-list-wrap"
    ref="listWrap"
    @click="onClick"
    @mousedown="onMousedown"
    @keydown="onKeydown"
  >
    <div v-if="dashboards.length === 0" class="sb-empty">{{ t('dash.noDashboards') }}</div>
    <div v-else-if="names.length === 0" class="sb-no-match">{{ t('dash.noMatch') }}</div>
    <template v-else>
      <div
        v-for="name in names"
        :key="name"
        class="sb-item"
        :class="{ active: name === current, selected: selected.includes(name) }"
        :data-name="name"
        tabindex="0"
        role="option"
        :aria-selected="selected.includes(name) ? 'true' : 'false'"
      >
        <span class="sb-item-name">{{ name }}</span>
        <span v-if="name === current && !editMode" class="sb-item-edit-icon" :title="t('dash.edit')">✎</span>
      </div>
    </template>
  </div>
</template>
