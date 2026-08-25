<script lang="ts">
/**
 * Legacy makeTplDropdown / makeUsersDropdown (dashboard_templates.html): a
 * filtered multi-select dropdown with click-toggle and drag paint-selection.
 *
 * - allRow=false (template variant): empty selection allowed, no ALL row.
 * - allRow=true (user variant): an ALL row is prepended (with separator) and
 *   always stays visible in the filter. Selecting ALL resets to ['ALL'],
 *   selecting a user clears ALL, and a click never empties the selection
 *   (last deselect → ['ALL']). A drag may empty it; mouseup then resets to
 *   ['ALL'] like the legacy onDragUp.
 * - Items toggle on press + release without moving past 5px (mousedown
 *   preventDefault + mouseup), paint-selection via document.elementFromPoint
 *   past the threshold (legacy applyDragAt), keyboard Enter/Space toggles.
 * - The button opens the dropdown (closing any other open dropdown via the
 *   module-level openUid below), resets and focuses the filter; document
 *   clicks close it — the legacy page-global click listener.
 * - Filtered items stay in the DOM with display:none (legacy applyFilter).
 * The local `sel` shadow keeps rapid drag updates synchronous (legacy
 * mutated its selection array in place); parent prop changes sync it.
 */
import { ref as vueRef } from 'vue';

/** Shared across instances: opening one dropdown closes the others (legacy). */
export const openUid = vueRef<string | null>(null);
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    options: string[];
    selected: string[];
    allRow?: boolean;
    countLabel?: string;
    uid: string;
  }>(),
  { allRow: false, countLabel: 'dash.nTemplates' }
);

const emit = defineEmits<{ 'update:selected': [value: string[]] }>();
const { t } = useI18n();

const isOpen = computed(() => openUid.value === props.uid);

/** Local shadow of the selection (legacy in-place mutation semantics). */
const sel = ref<string[]>(
  props.selected.length ? [...props.selected] : props.allRow ? ['ALL'] : []
);
watch(
  () => props.selected,
  (next) => {
    sel.value = [...next];
  }
);

function emitSelected(next: string[]): void {
  sel.value = next;
  emit('update:selected', [...next]);
}

const labelText = computed(() => {
  if (!sel.value.length) return t('dash.noneDash');
  if (props.allRow && sel.value.includes('ALL')) return 'ALL';
  if (sel.value.length === 1) return sel.value[0] ?? '';
  return t(props.countLabel, { count: sel.value.length });
});

/* ── Filter ── */

const filterQ = ref('');
const filterInput = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

/** Legacy opts: the ALL row is prepended in the users variant. */
const allOptions = computed(() => (props.allRow ? ['ALL', ...props.options] : props.options));

/** Legacy applyFilter: ALL stays visible in the users variant, else substring. */
function matches(option: string): boolean {
  const q = filterQ.value.trim().toLowerCase();
  if (!q) return true;
  if (props.allRow && option === 'ALL') return true;
  return option.toLowerCase().includes(q);
}

/* ── Open/close ── */

function onButtonClick(event: MouseEvent): void {
  event.stopPropagation();
  const wasOpen = isOpen.value;
  openUid.value = wasOpen ? null : props.uid;
  if (!wasOpen) {
    filterQ.value = '';
    nextTick(() => filterInput.value?.focus());
  }
}

function onDocumentClick(): void {
  openUid.value = null;
}

/* ── Selection (legacy setValueSelected / setItemSelected) ── */

/**
 * Legacy setValueSelected: ALL replaces/empties, selecting a user clears
 * ALL, and `allowEmpty` (false for click toggles in the users variant)
 * keeps at least ['ALL'].
 */
function applySelection(value: string, isSelected: boolean, allowEmpty: boolean): void {
  if (!value) return;
  if (props.allRow && value === 'ALL') {
    emitSelected(isSelected ? ['ALL'] : []);
    return;
  }
  let next = sel.value.filter((v) => v !== 'ALL');
  const ix = next.indexOf(value);
  if (isSelected && ix < 0) next = [...next, value];
  else if (!isSelected && ix >= 0) next = next.filter((v) => v !== value);
  if (props.allRow && !allowEmpty && next.length === 0) next = ['ALL'];
  emitSelected(next);
}

/** Legacy toggleItem (click/keyboard): users variant never empties. */
function toggleItem(value: string): void {
  if (!value) return;
  applySelection(value, !sel.value.includes(value), !props.allRow);
}

/* ── Drag paint-selection (legacy dragState / onDragMove / onDragUp) ── */

interface DragState {
  value: string;
  x: number;
  y: number;
  selecting: boolean;
  mode: 'add' | 'remove';
}

let drag: DragState | null = null;

function onItemMouseDown(event: MouseEvent, value: string): void {
  if (event.button !== 0) return;
  event.preventDefault();
  drag = {
    value,
    x: event.clientX,
    y: event.clientY,
    selecting: false,
    mode: sel.value.includes(value) ? 'remove' : 'add',
  };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragUp);
}

/** Legacy applyDragAt: apply the drag mode to the item under the cursor. */
function applyDragAt(x: number, y: number): void {
  if (!drag) return;
  const hit = document.elementFromPoint(x, y);
  const item = hit && hit.closest ? hit.closest('.msel-item') : null;
  if (!item) return;
  const list = listEl.value;
  if (!list || !list.contains(item)) return;
  const value = item.getAttribute('data-value') || '';
  applySelection(value, drag.mode === 'add', true);
}

function onDragMove(event: MouseEvent): void {
  if (!drag) return;
  if (
    !drag.selecting &&
    Math.max(Math.abs(event.clientX - drag.x), Math.abs(event.clientY - drag.y)) > 5
  ) {
    drag.selecting = true;
    applySelection(drag.value, drag.mode === 'add', true);
  }
  if (!drag.selecting) return;
  event.preventDefault();
  applyDragAt(event.clientX, event.clientY);
}

function onDragUp(): void {
  if (!drag) return;
  const selecting = drag.selecting;
  const value = drag.value;
  drag = null;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragUp);
  if (!selecting) {
    toggleItem(value);
  } else if (props.allRow && sel.value.length === 0) {
    // Legacy users onDragUp: a drag may empty the selection → back to ALL.
    emitSelected(['ALL']);
  }
}

/* ── Keyboard ── */

function onItemKeydown(event: KeyboardEvent, value: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleItem(value);
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  if (openUid.value === props.uid) openUid.value = null;
});
</script>

<template>
  <div class="msel-wrap">
    <div class="msel-btn" @click="onButtonClick">
      <span>{{ labelText }}</span>
      <span class="msel-arrow">▼</span>
    </div>
    <div class="msel-drop" :class="{ open: isOpen }" @click.stop>
      <!-- ui-migration: blocked — the dropdown filter input is chrome-free by
           design (borderless inside .msel-drop); the ui/ Input owns the
           bordered/h-8 chrome and cannot express this. -->
      <input
        ref="filterInput"
        v-model="filterQ"
        class="msel-filter"
        type="text"
        :placeholder="t('dash.filter')"
      >
      <div ref="listEl" class="msel-list">
        <template v-for="option in allOptions" :key="option">
          <div
            v-show="matches(option)"
            class="msel-item"
            :class="{ selected: sel.includes(option) }"
            :data-value="option"
            tabindex="0"
            role="option"
            :aria-selected="sel.includes(option) ? 'true' : 'false'"
            @mousedown="onItemMouseDown($event, option)"
            @keydown="onItemKeydown($event, option)"
          >
            <span>{{ option }}</span>
          </div>
          <div v-if="allRow && option === 'ALL'" class="msel-sep"></div>
        </template>
      </div>
    </div>
  </div>
</template>
