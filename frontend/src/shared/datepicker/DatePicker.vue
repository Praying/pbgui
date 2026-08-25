<script setup lang="ts">
import { computed, ref } from 'vue';
import { PhCalendarBlank } from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';

/**
 * DatePicker — the Vue port of the custom __dp popup calendar
 * (v7_backtest.html:4090-4333): a text input with an overlaid calendar
 * button, a month grid (Monday-first), prev/next month navigation, month/
 * year dropdowns, Today/Close footer and paired-field min/max bounds
 * (_range :4146-4166). Shared by the backtest config editor and the
 * suite scenario editor.
 *
 * Styling follows the ui/ component layer: the popup is the elevated
 * popover surface (bg-elevated + tinted shadow), the selected day uses
 * the solid accent fill, hover uses the accent tint — same language as
 * SelectContent/SelectItem.
 */

const model = defineModel<string>({ required: true });
const props = withDefaults(defineProps<{ placeholder?: string; min?: string; max?: string }>(), { placeholder: '' });

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const open = ref(false);
const year = ref(2026);
const month = ref(0);
const menu = ref<'month' | 'year' | ''>('');

interface Bounds {
  minMs: number | null;
  maxMs: number | null;
}

function dateToMs(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

const bounds = computed<Bounds>(() => ({ minMs: dateToMs(props.min), maxMs: dateToMs(props.max) }));

function show(): void {
  if (open.value) {
    open.value = false;
    return;
  }
  const raw = model.value && model.value !== 'now' ? model.value : '';
  const d = raw ? new Date(raw + 'T00:00:00') : new Date();
  const seed = Number.isNaN(d.getTime()) ? new Date() : d;
  year.value = seed.getFullYear();
  month.value = seed.getMonth();
  menu.value = '';
  open.value = true;
}

function dayMs(y: number, m: number, day: number): number {
  return new Date(y, m, day).getTime();
}

function monthHasSelectableDays(y: number, m: number): boolean {
  const { minMs, maxMs } = bounds.value;
  const monthStart = new Date(y, m, 1).getTime();
  const monthEnd = new Date(y, m + 1, 0).getTime();
  if (minMs !== null && monthEnd < minMs) return false;
  if (maxMs !== null && monthStart > maxMs) return false;
  return true;
}

function dayDisabled(day: number): boolean {
  const { minMs, maxMs } = bounds.value;
  const ms = dayMs(year.value, month.value, day);
  if (minMs !== null && ms < minMs) return true;
  if (maxMs !== null && ms > maxMs) return true;
  return false;
}

const weeks = computed<({ day: number; disabled: boolean; selected: boolean; today: boolean } | null)[][]>(() => {
  const first = new Date(year.value, month.value, 1);
  const daysInMonth = new Date(year.value, month.value + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7; // Monday-first (:4215)
  const now = new Date();
  const todayMs = dayMs(now.getFullYear(), now.getMonth(), now.getDate());
  const cells: ({ day: number; disabled: boolean; selected: boolean; today: boolean } | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const selected = model.value === `${year.value}-${String(month.value + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, disabled: dayDisabled(day), selected, today: dayMs(year.value, month.value, day) === todayMs });
  }
  const rows: ({ day: number; disabled: boolean; selected: boolean; today: boolean } | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
});

const yearOptions = computed(() => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2010; y <= current + 2; y++) {
    for (let m = 0; m < 12; m++) {
      if (monthHasSelectableDays(y, m)) {
        years.push(y);
        break;
      }
    }
  }
  return years;
});

function shiftMonth(delta: number): void {
  let y = year.value;
  let m = month.value + delta;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  while (m > 11) {
    m -= 12;
    y += 1;
  }
  if (!monthHasSelectableDays(y, m)) return;
  year.value = y;
  month.value = m;
  menu.value = '';
}

function setMonth(m: number): void {
  if (!monthHasSelectableDays(year.value, m)) return;
  month.value = m;
  menu.value = '';
}

function setYear(y: number): void {
  year.value = y;
  // snap to a month with selectable days (:4179-4191)
  if (!monthHasSelectableDays(y, month.value)) {
    for (let dist = 1; dist < 12; dist++) {
      const left = month.value - dist;
      const right = month.value + dist;
      if (left >= 0 && monthHasSelectableDays(y, left)) {
        month.value = left;
        break;
      }
      if (right < 12 && monthHasSelectableDays(y, right)) {
        month.value = right;
        break;
      }
    }
  }
  menu.value = '';
}

function pick(day: number): void {
  if (dayDisabled(day)) return;
  model.value = `${year.value}-${String(month.value + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  open.value = false;
}

function pickToday(): void {
  const now = new Date();
  year.value = now.getFullYear();
  month.value = now.getMonth();
  menu.value = '';
  pick(now.getDate());
}

const canPrev = computed(() => {
  const m = month.value - 1 < 0 ? 11 : month.value - 1;
  return monthHasSelectableDays(month.value - 1 < 0 ? year.value - 1 : year.value, m);
});
const canNext = computed(() => {
  const m = month.value + 1 > 11 ? 0 : month.value + 1;
  return monthHasSelectableDays(month.value + 1 > 11 ? year.value + 1 : year.value, m);
});
const canToday = computed(() => {
  const now = new Date();
  const { minMs, maxMs } = bounds.value;
  const ms = dayMs(now.getFullYear(), now.getMonth(), now.getDate());
  return !((minMs !== null && ms < minMs) || (maxMs !== null && ms > maxMs));
});
</script>

<template>
  <div class="dp-field relative">
    <Input v-model="model" type="text" class="w-full pr-6.5" :placeholder="placeholder" />
    <Button
      type="button"
      data-dp
      title="Open calendar"
      variant="ghost"
      class="absolute top-1/2 right-0.5 size-6 -translate-y-1/2 px-0"
      @click="show"
    >
      <PhCalendarBlank class="size-4" aria-hidden="true" />
    </Button>

    <div
      v-if="open"
      class="dp-popup absolute top-[calc(100%+4px)] left-0 z-[var(--z-dropdown)] min-w-[230px] rounded-lg border border-border-default bg-elevated px-3 py-2.5 text-primary shadow-elevated select-none"
      data-test="dp-popup"
    >
      <div class="mb-2 flex items-center gap-1">
        <Button type="button" data-test="dp-prev" variant="ghost" size="sm" class="dp-nav" :disabled="!canPrev" @click="shiftMonth(-1)">‹</Button>
        <div class="relative flex-1">
          <Button type="button" variant="ghost" size="sm" class="dp-nav w-full" @click="menu = menu === 'month' ? '' : 'month'">{{ MONTHS[month] }} ▾</Button>
          <div v-if="menu === 'month'" class="dp-dd left-0 min-w-[140px]">
            <button v-for="(name, m) in MONTHS" :key="name" type="button" class="dp-dd-item" :class="{ selected: m === month }" :disabled="!monthHasSelectableDays(year, m)" @click="setMonth(m)">{{ name }}</button>
          </div>
        </div>
        <div class="relative w-18">
          <Button type="button" variant="ghost" size="sm" class="dp-nav w-full" @click="menu = menu === 'year' ? '' : 'year'">{{ year }} ▾</Button>
          <div v-if="menu === 'year'" class="dp-dd right-0 left-auto min-w-[72px]">
            <button v-for="y in yearOptions" :key="y" type="button" class="dp-dd-item" :class="{ selected: y === year }" @click="setYear(y)">{{ y }}</button>
          </div>
        </div>
        <Button type="button" data-test="dp-next" variant="ghost" size="sm" class="dp-nav" :disabled="!canNext" @click="shiftMonth(1)">›</Button>
      </div>

      <div class="grid grid-cols-7 gap-0.5 text-center">
        <div v-for="d in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="d" class="grid h-7.5 place-items-center pb-1 text-xs text-secondary">{{ d }}</div>
        <template v-for="(week, wi) in weeks" :key="wi">
          <template v-for="(cell, ci) in week" :key="wi + '-' + ci">
            <div v-if="cell" class="dp-day grid h-7.5 cursor-pointer place-items-center rounded-sm text-sm text-primary transition-colors duration-[120ms] ease-standard" :class="{ 'dp-disabled': cell.disabled, selected: cell.selected, today: cell.today }" @click="pick(cell.day)">{{ cell.day }}</div>
            <div v-else></div>
          </template>
        </template>
      </div>

      <div class="mt-2 flex justify-between">
        <Button type="button" data-test="dp-close" variant="ghost" size="sm" class="dp-nav" @click="open = false">Close</Button>
        <Button type="button" data-test="dp-today" variant="ghost" size="sm" class="dp-nav" :disabled="!canToday" @click="pickToday">Today</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Popup chrome states — the markup carries the layout utilities; these
   state hooks (selected/today/disabled) stay as classes because the
   tests and the paired-field logic target them by name. */
.dp-dd {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 2;
  display: block;
  max-height: 220px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-elevated);
}
.dp-dd-item {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  text-align: left;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.dp-dd-item:hover:not(:disabled) {
  background: var(--accent-bg);
  color: var(--text-primary);
}
.dp-dd-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.dp-dd-item.selected {
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}
.dp-day:hover {
  background: var(--accent-bg);
}
.dp-day.selected {
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}
.dp-day.selected:hover {
  background: var(--accent);
}
.dp-day.today {
  background: rgba(255, 255, 255, 0.12);
}
.dp-day.today.selected {
  background: var(--accent);
}
.dp-day.dp-disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}
.dp-day.dp-disabled:hover {
  background: transparent;
}
</style>
