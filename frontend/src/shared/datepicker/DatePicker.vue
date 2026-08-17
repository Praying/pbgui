<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * DatePicker — the Vue port of the custom __dp popup calendar
 * (v7_backtest.html:4090-4333): a text input with an overlaid 📅 button,
 * a month grid (Monday-first), prev/next month navigation, month/year
 * dropdowns, Today/Close footer and paired-field min/max bounds
 * (_range :4146-4166). Shared by the backtest config editor and the
 * suite scenario editor.
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
  <div class="dp-field" style="position: relative">
    <input v-model="model" type="text" class="form-input" style="width: 100%; box-sizing: border-box; padding-right: 26px" :placeholder="placeholder" />
    <button
      type="button"
      data-dp
      title="Open calendar"
      style="position: absolute; right: 2px; top: 50%; transform: translateY(-50%); background: transparent; border: none; padding: 0 3px; font-size: var(--fs-sm); line-height: 1; cursor: pointer"
      @click="show"
    >
      📅
    </button>

    <div v-if="open" class="dp-popup" data-test="dp-popup" style="position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; background: var(--bg2, #1e2030); border: 1px solid var(--border, #444); border-radius: 8px; padding: 10px 12px; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.7); user-select: none; min-width: 230px">
      <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 8px">
        <button type="button" data-test="dp-prev" :disabled="!canPrev" @click="shiftMonth(-1)">‹</button>
        <div style="position: relative; flex: 1">
          <button type="button" style="width: 100%" @click="menu = menu === 'month' ? '' : 'month'">{{ MONTHS[month] }} ▾</button>
          <div v-if="menu === 'month'" class="dp-dd" style="left: 0; min-width: 140px">
            <button v-for="(name, m) in MONTHS" :key="name" type="button" class="dp-dd-item" :class="{ selected: m === month }" :disabled="!monthHasSelectableDays(year, m)" @click="setMonth(m)">{{ name }}</button>
          </div>
        </div>
        <div style="position: relative; width: 72px">
          <button type="button" style="width: 100%" @click="menu = menu === 'year' ? '' : 'year'">{{ year }} ▾</button>
          <div v-if="menu === 'year'" class="dp-dd" style="right: 0; left: auto; min-width: 72px">
            <button v-for="y in yearOptions" :key="y" type="button" class="dp-dd-item" :class="{ selected: y === year }" @click="setYear(y)">{{ y }}</button>
          </div>
        </div>
        <button type="button" data-test="dp-next" :disabled="!canNext" @click="shiftMonth(1)">›</button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(7, 30px); gap: 2px; text-align: center">
        <div v-for="d in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="d" style="color: var(--text-dim, #888); font-size: var(--fs-xs); padding-bottom: 4px">{{ d }}</div>
        <template v-for="(week, wi) in weeks" :key="wi">
          <template v-for="(cell, ci) in week" :key="wi + '-' + ci">
            <div v-if="cell" class="dp-day" :class="{ 'dp-disabled': cell.disabled, selected: cell.selected, today: cell.today }" @click="pick(cell.day)">{{ cell.day }}</div>
            <div v-else></div>
          </template>
        </template>
      </div>

      <div style="margin-top: 8px; display: flex; justify-content: space-between">
        <button type="button" data-test="dp-close" @click="open = false">Close</button>
        <button type="button" data-test="dp-today" :disabled="!canToday" @click="pickToday">Today</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dp-popup button {
  background: none;
  border: none;
  color: var(--text, #ccc);
  cursor: pointer;
  font-size: var(--fs-xs);
}
.dp-popup button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.dp-dd {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 2;
  display: block;
  background: var(--bg3, #2a2d40);
  border: 1px solid var(--border, #444);
  border-radius: 6px;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.55);
  max-height: 220px;
  overflow: auto;
  padding: 4px;
}
.dp-dd-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border-radius: 4px;
}
.dp-dd-item.selected {
  background: var(--accent, #4a90d9);
  color: #fff;
}
.dp-day {
  cursor: pointer;
  border-radius: 4px;
  padding: 4px 0;
  color: var(--text, #ccc);
  font-size: var(--fs-sm);
}
.dp-day:hover {
  background: rgba(255, 255, 255, 0.15);
}
.dp-day.selected {
  background: var(--accent, #4a90d9);
  font-weight: 600;
}
.dp-day.today {
  background: rgba(255, 255, 255, 0.12);
}
.dp-day.dp-disabled {
  color: rgba(255, 255, 255, 0.28);
  cursor: not-allowed;
}
.dp-day.dp-disabled:hover {
  background: transparent;
}
</style>
