<script setup lang="ts">
/**
 * MultiSelectDropdown — the Vue port of the legacy editor's
 * makeUsersDropdown (dashboard_editor.html:671-857).
 *
 * Ported semantics (including quirks):
 *  - value model: `['ALL']` = all users; empty selection snap-backs to
 *    `['ALL']` (legacy auto-rechecks ALL when the last user is deselected).
 *  - label: empty → dash.selectDash; contains ALL → literal 'ALL'; one user →
 *    that user; else dash.nUsers {count}.
 *  - option order: ALL first (with separator), then non-ALL selected users in
 *    selection order, then the full users list; falsy entries skipped.
 *  - the dropdown is a portal (Teleport → body), positioned with the legacy
 *    viewport math (lib/mselPosition.ts), re-positioned on window
 *    resize/scroll while open, filter reset + focused on open.
 *  - changes are committed ONLY on close, and only when dirty AND different
 *    (sameSelection order-sensitive compare) — the legacy builder pattern
 *    relied on onChange firing once per close.
 *  - one dropdown open at a time (lib/mselRegistry replaces the legacy
 *    document-wide `.msel-drop.open` close-others sweep).
 *
 * Deviation (legacy bug fix, R4-style): unmounting mid-edit closes the portal
 * without emitting — legacy left the body-ported dropdown orphaned and
 * interactive after its host widget was rebuilt.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { dashT } from '../lib/i18n';
import { mselPosition } from '../lib/mselPosition';
import { closeMselDropdown, openMselDropdown } from '../lib/mselRegistry';

const props = withDefaults(
  defineProps<{
    /** Legacy state[uKey] — the users multi-select value; null/empty = ALL. */
    modelValue: string[] | null;
    /** Legacy page-global allUsers (already filtered of 'ALL' by D-3). */
    users?: string[];
  }>(),
  { users: () => [] }
);

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

/* ── selection state (editor:673-675) ── */

const selected = ref<string[]>(
  props.modelValue && props.modelValue.length ? [...props.modelValue] : ['ALL']
);
const committed = ref<string[]>([...selected.value]);
const dirty = ref(false);

const isOpen = ref(false);
const filter = ref('');
const btnEl = ref<HTMLElement | null>(null);
const filterEl = ref<HTMLInputElement | null>(null);
const dropStyle = ref<Record<string, string>>({});
const listStyle = ref<Record<string, string>>({});

/* External updates only apply while not editing (legacy rebuilt the whole
   control on change, so mid-edit external updates never existed). */
watch(
  () => props.modelValue,
  (v) => {
    if (dirty.value) return;
    const next = v && v.length ? [...v] : ['ALL'];
    selected.value = next;
    committed.value = [...next];
  }
);

/* ── label (editor:756-761) ── */

const label = computed<string>(() => {
  if (!selected.value.length) return dashT('dash.selectDash', '— select —');
  if (selected.value.indexOf('ALL') >= 0) return 'ALL';
  if (selected.value.length === 1) return selected.value[0]!;
  return dashT('dash.nUsers', '{count} users', { count: selected.value.length });
});

/* ── options (editor:704-718) ── */

const options = computed<string[]>(() => {
  const out = ['ALL'];
  const seen = new Set(['ALL']);
  if (selected.value.indexOf('ALL') < 0) {
    for (const u of selected.value) {
      if (!u || seen.has(u)) continue;
      out.push(u);
      seen.add(u);
    }
  }
  for (const u of props.users) {
    if (!u || seen.has(u)) continue;
    out.push(u);
    seen.add(u);
  }
  return out;
});

/* ── filter (editor:824-830) ── */

function matchesFilter(u: string): boolean {
  const q = filter.value.toLowerCase();
  const u2 = u.toLowerCase();
  return !q || u2 === 'all' || u2.indexOf(q) >= 0;
}

/* ── checkbox semantics (editor:772-799) ── */

function toggleValue(val: string, checked: boolean): void {
  if (val === 'ALL') {
    if (checked) selected.value = ['ALL'];
    else selected.value = [];
  } else {
    const ai = selected.value.indexOf('ALL');
    if (ai >= 0) selected.value.splice(ai, 1);
    const ix = selected.value.indexOf(val);
    if (checked && ix < 0) selected.value.push(val);
    else if (!checked && ix >= 0) selected.value.splice(ix, 1);
    if (selected.value.length === 0) selected.value = ['ALL'];
  }
  dirty.value = true;
}

function onItemClick(u: string, e: MouseEvent): void {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  toggleValue(u, selected.value.indexOf(u) < 0);
}

/* ── open/close/commit (editor:738-755, 832-850) ── */

function sameSelection(a: string[], b: string[]): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function commitSelection(): void {
  if (!dirty.value || sameSelection(selected.value, committed.value)) return;
  committed.value = [...selected.value];
  dirty.value = false;
  emit('update:modelValue', [...committed.value]);
}

function positionDrop(): void {
  if (!isOpen.value) return;
  if (!btnEl.value || !btnEl.value.isConnected) {
    closeDrop();
    return;
  }
  const rect = btnEl.value.getBoundingClientRect();
  const pos = mselPosition({
    btnRect: { right: rect.right, bottom: rect.bottom, top: rect.top, width: rect.width },
    win: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
    filterHeight: filterEl.value?.offsetHeight ?? 0,
  });
  dropStyle.value = {
    left: pos.left + 'px',
    top: pos.top + 'px',
    width: pos.width + 'px',
    maxHeight: pos.maxHeight + 'px',
  };
  listStyle.value = { maxHeight: pos.listMaxHeight + 'px' };
}

function closeDrop(): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  closeMselDropdown(closeDrop);
  window.removeEventListener('resize', positionDrop);
  window.removeEventListener('scroll', positionDrop, true);
  commitSelection();
}

function openDrop(): void {
  openMselDropdown(closeDrop); // closes every other open dropdown first
  isOpen.value = true;
  filter.value = '';
  window.addEventListener('resize', positionDrop);
  window.addEventListener('scroll', positionDrop, true);
  void nextTick(() => {
    positionDrop();
    filterEl.value?.focus();
  });
}

function onBtnClick(e: MouseEvent): void {
  e.stopPropagation();
  if (!isOpen.value) openDrop();
  else closeDrop();
}

onBeforeUnmount(() => {
  if (!isOpen.value) return;
  isOpen.value = false;
  closeMselDropdown(closeDrop);
  window.removeEventListener('resize', positionDrop);
  window.removeEventListener('scroll', positionDrop, true);
  /* no commit on unmount — legacy lost mid-edit selections on rebuild too */
});
</script>

<template>
  <div class="msel-wrap">
    <div ref="btnEl" class="msel-btn" @click="onBtnClick">
      <span>{{ label }}</span>
      <span class="msel-arrow">▼</span>
    </div>
    <Teleport to="body">
      <div v-if="isOpen" class="msel-drop open" :style="dropStyle" @click.stop>
        <input
          ref="filterEl"
          v-model="filter"
          type="text"
          class="msel-filter"
          :placeholder="dashT('dash.filterDots', 'Filter...')"
        />
        <div class="msel-list" :style="listStyle">
          <template v-for="u in options" :key="u">
            <div
              v-show="matchesFilter(u)"
              class="msel-item"
              :class="{ selected: selected.indexOf(u) >= 0 }"
              :data-u="u.toLowerCase()"
              @click="onItemClick(u, $event)"
            >
              <input
                type="checkbox"
                :value="u"
                :checked="selected.indexOf(u) >= 0"
                @change="toggleValue(u, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ u }}</span>
            </div>
            <div v-if="u === 'ALL'" class="msel-sep"></div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Layout for the button internals only — the .msel-* visual rules live in
   styles/editor.css (ported verbatim from the legacy <style> block). */
.msel-btn { display: flex; justify-content: space-between; align-items: center; }
</style>
