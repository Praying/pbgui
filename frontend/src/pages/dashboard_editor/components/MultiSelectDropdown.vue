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
import { Input } from '@/shared/components/ui/input';
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
/* ui/Input — the template ref exposes focus()/blur()/select(), not the
   element, so the legacy `filter.offsetHeight` read moves to dropEl (the
   teleported drop root) and queries the input by its anchor class. */
const filterEl = ref<{ focus(): void } | null>(null);
const dropEl = ref<HTMLElement | null>(null);
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
  const filterInput = dropEl.value?.querySelector('.msel-filter') as HTMLElement | null;
  const pos = mselPosition({
    btnRect: { right: rect.right, bottom: rect.bottom, top: rect.top, width: rect.width },
    win: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
    filterHeight: filterInput?.offsetHeight ?? 0,
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
  <div class="msel-wrap relative w-full">
    <div
      ref="btnEl"
      class="msel-btn flex w-full cursor-pointer items-center justify-between truncate rounded-sm border border-secondary bg-border-default px-[0.5rem] py-[0.25rem] text-left text-sm text-primary hover:border-accent-soft"
      @click="onBtnClick"
    >
      <span>{{ label }}</span>
      <span class="msel-arrow ml-[0.4rem] shrink-0 text-[0.55rem]">▼</span>
    </div>
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="dropEl"
        class="msel-drop open fixed z-[var(--z-dropdown)] mt-[2px] min-w-[180px] max-h-[260px] overflow-hidden rounded-sm border border-secondary bg-card shadow-[var(--shadow-modal)]"
        :style="dropStyle"
        @click.stop
      >
        <Input
          ref="filterEl"
          v-model="filter"
          type="text"
          class="msel-filter"
          :placeholder="dashT('dash.filterDots', 'Filter...')"
        />
        <div class="msel-list max-h-[220px] overflow-y-auto" :style="listStyle">
          <template v-for="u in options" :key="u">
            <div
              v-show="matchesFilter(u)"
              class="msel-item flex cursor-pointer items-center gap-[0.4rem] px-[0.6rem] py-[0.3rem] text-sm whitespace-nowrap"
              :class="selected.indexOf(u) >= 0 ? 'selected bg-accent/12 text-primary hover:bg-accent/18' : 'text-primary hover:bg-border-default'"
              :data-u="u.toLowerCase()"
              @click="onItemClick(u, $event)"
            >
              <!-- ui-migration: blocked — the option checkboxes are part of the
                   teleported dropdown logic (the row-click guard keys on
                   tagName === 'INPUT' and the tests drive native .checked +
                   change events), not standalone form controls -->
              <input
                type="checkbox"
                class="m-0 cursor-pointer accent-accent-soft"
                :value="u"
                :checked="selected.indexOf(u) >= 0"
                @change="toggleValue(u, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ u }}</span>
            </div>
            <div v-if="u === 'ALL'" class="msel-sep my-[0.15rem] border-t border-t-border-default"></div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* Host-context sizing (the legacy .dt-meta-controls .msel-* rules of
   styles/widgets.css): the compact widget header hosts shrink the
   dropdown. Unscoped on purpose — the hosts render this component's
   root element, so a scoped selector could never match. Un-layered CSS
   also beats the component's w-full utility, which is what the legacy
   `width:auto !important` accomplished. */
.dt-meta-controls .msel-wrap {
  width: auto;
  flex-shrink: 0;
}
.dt-meta-controls .msel-btn {
  min-width: 80px;
  max-width: 120px;
  font-size: 0.73rem;
  padding: 0.2rem 0.35rem;
}
</style>
