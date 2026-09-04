<script setup lang="ts">
/**
 * IncomeTable — the table half of the income widget: the port of
 * `_buildIncomeTable` (dashboard_render.js:1030-1470) on Vue reactivity.
 *
 * Legacy parity notes:
 *  - rows render in SERVER order until the first header click (legacy called
 *    renderTable before any doSort); sortCol starts 'date'/desc like the
 *    legacy closure even while unsorted (the ▼ shows immediately);
 *  - selection is id-keyed (legacy `selected` object on data-income-id);
 *  - drag-select: mousedown arms {row, y} + add/remove mode from the anchor
 *    row's current state; moves only select after a 5px vertical threshold;
 *    the range spans anchor→pointer via row bounding-rect tops (rowIndexAtY);
 *    a mouseup without movement toggles the anchor row (render.js:1219-1233);
 *  - jump-to-date: exact date → immediate scroll; otherwise the debounced
 *    onJumpToDate (600 ms, only while the input still holds the target), or
 *    the closest-date scroll fallback when no handler is wired (the editor
 *    passes none — render.js:1071-1115);
 *  - delete-selected / delete-older / restore all go through the confirm
 *    overlay; delete payloads use the ALL-users collapse and the selected
 *    rows' min date_ms (render.js:1275-1311);
 *  - a rows replacement resets selection/sort/backup panel (legacy full
 *    rebuild on every fetch) and preserves the wrap scroll position across
 *    both in-place updates and epoch remounts (render.js:894-898, 1022-1026);
 *  - listeners/timers are removed on unmount (R4 fix — legacy leaked the
 *    document drag handlers on every rebuild).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { PhWarning, PhX } from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { dashT } from '../../lib/i18n';
import {
  DRAG_THRESHOLD_PX,
  INCOME_COLUMNS,
  JUMP_DEBOUNCE_MS,
  RELOAD_DELAY_MS,
  STATUS_HIDE_MS,
  cutoffDateText,
  deleteOlderUsersParam,
  findClosestDateIndex,
  findExactDateIndex,
  rowIndexAtTops,
  saveIncomeScroll,
  scanDeleteOlderSelection,
  selectionBounds,
  sortIncomeRows,
  takeIncomeScroll,
  type IncomeSortKey,
} from '../../lib/incomeLogic';
import { useIncomeActions } from '../../composables/useIncomeActions';
import type { IncomeRow } from '../../types/widgets';
import { dtMetaLblClass, dtNodataClass } from './uiClasses';

/* The former .di-btn* tone variants of styles/widgets.css are ui/Button
   variants now; the legacy class names ride along as inert anchors the
   tests select (di-btn, di-btn-danger/di-btn-yes/di-btn-no). */

const props = defineProps<{
  /** data.rows from /dashboard/income_data (server order: date_ms desc). */
  rows: IncomeRow[];
  /** Legacy opts.users — drives the delete-older ALL collapse. */
  users: string[] | null;
  /** Legacy %%API_BASE%%. */
  apiBase: string;
  /** `row_col` cell key — the scroll-memory key. */
  pos: string;
  /** Legacy onJumpToDate — null in the editor (closest-scroll fallback). */
  onJumpToDate: ((date: string) => void) | null;
  /** Legacy onReload — refetch after destructive actions. */
  onReload: () => void;
}>();

const actions = useIncomeActions({ apiBase: props.apiBase });

/* ── no-data early return (render.js:1032-1038) ── */

const hasRows = computed<boolean>(() => props.rows.length > 0);

/* ── selection + sort state (render.js:1041-1047) ── */

const selected = ref<Record<string, boolean>>({});
const sortCol = ref<IncomeSortKey>('date');
const sortAsc = ref(false);
/** Legacy rendered before any doSort — flag until the first header click. */
const hasSorted = ref(false);

const selectedCount = computed<number>(() => Object.keys(selected.value).length);

const sortedRows = computed<IncomeRow[]>(() =>
  hasSorted.value ? sortIncomeRows(props.rows, sortCol.value, sortAsc.value) : props.rows
);

function isSelected(id: number): boolean {
  return selected.value[String(id)] === true;
}

function setSelected(id: number, isSelectedNow: boolean): void {
  if (isSelectedNow) selected.value = { ...selected.value, [String(id)]: true };
  else {
    const next = { ...selected.value };
    delete next[String(id)];
    selected.value = next;
  }
}

function toggleRow(index: number): void {
  const r = sortedRows.value[index];
  if (!r) return;
  setSelected(r.id, !isSelected(r.id));
}

/* ── sorting (render.js:1118-1131) ── */

function onSortClick(key: IncomeSortKey): void {
  if (sortCol.value === key) sortAsc.value = !sortAsc.value;
  else {
    sortCol.value = key;
    sortAsc.value = true;
  }
  hasSorted.value = true;
  clearJumpDebounce(); /* legacy re-created the jump input per render */
}

function sortArrow(key: string): string {
  if (sortCol.value !== key) return '';
  return sortAsc.value ? ' ▲' : ' ▼';
}

/* ── DOM refs ── */

const wrapEl = ref<HTMLElement | null>(null);
const tableEl = ref<HTMLTableElement | null>(null);

function rowElements(): HTMLTableRowElement[] {
  const table = tableEl.value;
  if (!table) return [];
  return Array.prototype.slice.call(
    table.querySelectorAll('tbody tr[data-income-id]')
  ) as HTMLTableRowElement[];
}

/* ── drag-select (render.js:1189-1260) ── */

interface DragStart {
  index: number;
  y: number;
}

let dragStart: DragStart | null = null;
let dragSelecting = false;
let dragMode: 'add' | 'remove' | null = null;

function applySelectionRange(anchorIndex: number, y: number, mode: 'add' | 'remove'): void {
  const tops = rowElements().map((el) => el.getBoundingClientRect().top);
  const current = rowIndexAtTops(tops, y);
  const { low, high } = selectionBounds(anchorIndex, current);
  for (let i = low; i <= high; i++) {
    const r = sortedRows.value[i];
    if (!r) continue;
    setSelected(r.id, mode === 'add');
  }
}

function onDocMouseMove(event: MouseEvent): void {
  if (!dragStart) return;
  if (!dragSelecting && Math.abs(event.clientY - dragStart.y) > DRAG_THRESHOLD_PX) {
    dragSelecting = true;
  }
  if (!dragSelecting) return;
  event.preventDefault();
  applySelectionRange(dragStart.index, event.clientY, dragMode === 'remove' ? 'remove' : 'add');
}

function onDocMouseUp(): void {
  if (!dragStart) return;
  if (!dragSelecting) toggleRow(dragStart.index);
  resetDrag();
}

function resetDrag(): void {
  document.removeEventListener('mousemove', onDocMouseMove);
  document.removeEventListener('mouseup', onDocMouseUp);
  dragStart = null;
  dragSelecting = false;
  dragMode = null;
}

function rowIndexOf(tr: HTMLTableRowElement): number {
  const id = tr.getAttribute('data-income-id');
  return sortedRows.value.findIndex((r) => String(r.id) === id);
}

function onTableMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  const tr =
    target && target.closest
      ? (target.closest('tbody tr[data-income-id]') as HTMLTableRowElement | null)
      : null;
  if (!tr || !tableEl.value || !tableEl.value.contains(tr)) return;
  const index = rowIndexOf(tr);
  if (index < 0) return;
  event.preventDefault();
  dragStart = { index, y: event.clientY };
  dragSelecting = false;
  dragMode = isSelected(sortedRows.value[index]!.id) ? 'remove' : 'add';
  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup', onDocMouseUp);
}

function onTableKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target as HTMLElement | null;
  const tr =
    target && target.closest
      ? (target.closest('tbody tr[data-income-id]') as HTMLTableRowElement | null)
      : null;
  if (!tr || !tableEl.value || !tableEl.value.contains(tr)) return;
  event.preventDefault();
  const index = rowIndexOf(tr);
  if (index >= 0) toggleRow(index);
}

/* ── jump-to-date (render.js:1071-1115) ── */

let jumpDebounce: ReturnType<typeof setTimeout> | null = null;

function clearJumpDebounce(): void {
  if (jumpDebounce !== null) {
    clearTimeout(jumpDebounce);
    jumpDebounce = null;
  }
}

function scrollToRowIndex(index: number): void {
  const wrap = wrapEl.value;
  const tr = rowElements()[index];
  if (!wrap || !tr) return;
  const thead = tableEl.value ? tableEl.value.querySelector('thead') : null;
  const theadH = thead ? (thead as HTMLTableSectionElement).offsetHeight : 0;
  const rTop = tr.getBoundingClientRect().top;
  const wTop = wrap.getBoundingClientRect().top;
  wrap.scrollTop = wrap.scrollTop + (rTop - wTop) - theadH;
}

function onJumpChange(event: Event): void {
  /* legacy captured the input element in the change closure (`ji`) */
  const ji = event.target as HTMLInputElement;
  const target = ji.value;
  if (!target) return;
  /* exact match → scroll immediately (render.js:1089-1096) */
  const exact = findExactDateIndex(sortedRows.value, target);
  if (exact >= 0) {
    clearJumpDebounce();
    scrollToRowIndex(exact);
    return;
  }
  /* not in current rows → debounced reload (render.js:1097-1105) */
  if (typeof props.onJumpToDate === 'function') {
    clearJumpDebounce();
    const onJump = props.onJumpToDate;
    jumpDebounce = setTimeout(() => {
      jumpDebounce = null;
      if (ji.value === target) onJump(target);
    }, JUMP_DEBOUNCE_MS);
    return;
  }
  /* fallback: closest entry (render.js:1106-1113) */
  scrollToRowIndex(findClosestDateIndex(sortedRows.value, target));
}

/* ── confirm overlay (render.js:1351-1376) ── */

const confirmMsg = ref('');
const confirmAction: Ref<(() => void) | null> = ref(null);

function showConfirm(msg: string, onYes: () => void): void {
  confirmMsg.value = msg;
  confirmAction.value = onYes;
}

function onConfirmYes(): void {
  const action = confirmAction.value;
  confirmMsg.value = '';
  confirmAction.value = null;
  if (action) action();
}

function onConfirmNo(): void {
  confirmMsg.value = '';
  confirmAction.value = null;
}

/* ── status line (render.js:1378-1382) ── */

const statusMsg = ref('');
const statusTimers: ReturnType<typeof setTimeout>[] = [];

function showStatus(msg: string): void {
  statusMsg.value = msg;
  /* legacy stacked one hide-timer per message (the oldest hides first) */
  statusTimers.push(
    setTimeout(() => {
      statusMsg.value = '';
    }, STATUS_HIDE_MS)
  );
}

function errorText(message: string): string {
  return dashT('common.error', 'Error') + ': ' + message;
}

/* ── delete flows (render.js:1275-1311, 1384-1401) ── */

function reloadSoon(): void {
  if (props.onReload) setTimeout(() => props.onReload(), RELOAD_DELAY_MS);
}

type DeletePending = Promise<{ ok: true; deleted: number } | { ok: false; message: string }>;

async function runDelete(pending: DeletePending): Promise<void> {
  const result = await pending;
  if (result.ok) {
    showStatus(
      dashT('dash.deletedRowsBackup', 'Deleted {count} row(s). Backup created.', { count: result.deleted })
    );
    selected.value = {};
    reloadSoon();
  } else {
    showStatus(errorText(result.message));
  }
}

function onDeleteSelected(): void {
  const ids = Object.keys(selected.value).map(Number);
  showConfirm(
    dashT('dash.deleteIncomeConfirm', 'Delete {count} selected income row(s)?', { count: ids.length }),
    () => {
      void runDelete(actions.deleteIds(ids));
    }
  );
}

function onDeleteOlder(): void {
  const scan = scanDeleteOlderSelection(sortedRows.value, selected.value);
  if (!scan) return;
  const usersParam = deleteOlderUsersParam(props.users, scan.selectedUsers);
  showConfirm(
    dashT('dash.deleteOlderConfirm', 'Delete all income for {users} with timestamp ≤ {cutoff}?', {
      users: usersParam[0] === 'ALL' ? dashT('dash.allUsers', 'ALL users') : usersParam.join(', '),
      cutoff: cutoffDateText(scan.cutoffMs),
    }),
    () => {
      void runDelete(actions.deleteOlder(usersParam, scan.cutoffMs));
    }
  );
}

/* ── backup/restore panel (render.js:1314-1321, 1403-1469) ── */

interface BackupEntry {
  name: string;
  path: string;
  date: string;
}

const backupOpen = ref(false);
const backupsLoading = ref(false);
const backupsError = ref(false);
const backups = ref<BackupEntry[]>([]);
const selectedPath = ref('');

async function loadBackups(): Promise<void> {
  backupOpen.value = true;
  backupsLoading.value = true;
  backupsError.value = false;
  const result = await actions.listBackups();
  backupsLoading.value = false;
  if (!result.ok) {
    backupsError.value = true;
    backups.value = [];
    return;
  }
  backups.value = result.backups;
  selectedPath.value = result.backups.length > 0 ? result.backups[0]!.path : '';
}

function backupLabel(b: BackupEntry): string {
  return b.name + ' — ' + b.date;
}

/** The listbox trigger label — the legacy <select> showed the selected
 *  option's text. */
const selectedBackupLabel = computed<string>(() => {
  const chosen = backups.value.find((b) => b.path === selectedPath.value);
  return chosen ? backupLabel(chosen) : '';
});

function onRestoreClick(): void {
  const chosen = backups.value.find((b) => b.path === selectedPath.value);
  showConfirm(
    dashT('dash.restoreConfirm', 'Restore database from {name}?', {
      name: chosen ? backupLabel(chosen) : '',
    }),
    async () => {
      const result = await actions.restore(selectedPath.value);
      if (!result.ok) {
        showStatus(errorText(result.message));
        return;
      }
      if (result.restored) {
        showStatus(dashT('dash.databaseRestored', 'Database restored successfully.'));
        backupOpen.value = false;
        selected.value = {};
        reloadSoon();
      } else {
        showStatus(dashT('dash.restoreFailed', 'Restore failed.'));
      }
    }
  );
}

/* updateActions (render.js:1343-1349): empty selection hides the panel */
watch(selectedCount, (count) => {
  if (count === 0) backupOpen.value = false;
});

/* ── data-refresh resets + scroll preserve (render.js:894-898, 1022-1026) ── */

function currentScroll(): number {
  return wrapEl.value ? wrapEl.value.scrollTop : 0;
}

watch(
  () => props.rows,
  () => {
    if (wrapEl.value) saveIncomeScroll(props.pos, currentScroll());
    /* legacy full rebuild: fresh closure state */
    selected.value = {};
    hasSorted.value = false;
    sortCol.value = 'date';
    sortAsc.value = false;
    confirmMsg.value = '';
    confirmAction.value = null;
    backupOpen.value = false;
    clearJumpDebounce();
  }
);

/* restore after the re-render, exactly like buildIncome's post-rebuild step */
watch(
  () => props.rows,
  () => {
    if (wrapEl.value) wrapEl.value.scrollTop = takeIncomeScroll(props.pos);
  },
  { flush: 'post' }
);

onMounted(() => {
  /* epoch-remount restore (legacy saved the scroll before the rebuild) */
  if (takeIncomeScroll(props.pos) > 0 && wrapEl.value) wrapEl.value.scrollTop = takeIncomeScroll(props.pos);
});

onBeforeUnmount(() => {
  resetDrag();
  clearJumpDebounce();
  if (wrapEl.value) saveIncomeScroll(props.pos, currentScroll());
  for (const t of statusTimers) clearTimeout(t);
});
</script>

<template>
  <div v-if="!hasRows" :class="dtNodataClass">
    {{ dashT('dash.noDataPeriod', 'No data for the selected period.') }}
  </div>
  <template v-else>
    <div ref="wrapEl" class="di-table-wrap min-h-0 flex-1 overflow-x-auto overflow-y-auto">
      <table
        ref="tableEl"
        class="di-table w-full select-none border-separate border-spacing-0 text-[0.78rem]"
        @mousedown="onTableMouseDown"
        @keydown="onTableKeydown"
      >
        <thead>
          <tr>
            <th
              v-for="c in INCOME_COLUMNS"
              :key="c.key"
              class="sticky top-0 cursor-pointer select-none border-b-2 border-b-border-default bg-card px-[0.5rem] py-[0.35rem] text-left font-semibold whitespace-nowrap text-secondary hover:text-primary"
              @click="onSortClick(c.key)"
            >
              {{ dashT(c.labelKey, c.fallback) }}<span class="di-sort ml-[0.2rem] text-[0.65rem] text-muted">{{ sortArrow(c.key) }}</span>
              <Input
                v-if="c.key === 'date'"
                type="date"
                size="sm"
                class="di-jump-input ml-[0.4rem] w-[108px]"
                :title="dashT('dash.goToDate', 'Go to date')"
                @click.stop
                @change="onJumpChange"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in sortedRows"
            :key="r.id"
            class="cursor-pointer"
            :data-income-id="String(r.id)"
            :tabindex="0"
            :aria-selected="isSelected(r.id) ? 'true' : 'false'"
            :class="{ 'di-sel': isSelected(r.id) }"
          >
            <td class="border-b border-b-card px-[0.5rem] py-[0.3rem] whitespace-nowrap">{{ r.date }}</td>
            <td class="border-b border-b-card px-[0.5rem] py-[0.3rem] whitespace-nowrap">{{ r.user }}</td>
            <td class="border-b border-b-card px-[0.5rem] py-[0.3rem] whitespace-nowrap">{{ r.symbol }}</td>
            <td
              class="border-b border-b-card px-[0.5rem] py-[0.3rem] whitespace-nowrap"
              :class="r.income >= 0 ? 'di-inc-pos text-success-soft' : 'di-inc-neg text-danger-soft'"
            >{{ r.income.toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- action bar (render.js:1271-1323) -->
    <div v-show="selectedCount > 0" class="di-actions flex flex-wrap items-center gap-[0.5rem] border-t border-t-card bg-page px-[0.75rem] py-[0.4rem]">
      <Button type="button" size="sm" variant="danger" class="di-btn di-btn-danger" @click="onDeleteSelected">
        {{ dashT('dash.deleteSelected', 'Delete selected…') }}
      </Button>
      <Button type="button" size="sm" variant="danger" class="di-btn di-btn-danger" @click="onDeleteOlder">
        {{ dashT('dash.deleteOlder', 'Delete older than selected…') }}
      </Button>
      <Button type="button" size="sm" class="di-btn" @click="loadBackups">
        {{ dashT('dash.backupRestore', 'Backup / Restore…') }}
      </Button>
    </div>

    <!-- backup panel (render.js:1325-1329, 1403-1469) -->
    <div v-show="selectedCount > 0 && backupOpen" class="di-backup border-t border-t-border-default bg-card px-[0.75rem] py-[0.5rem]">
      <span v-if="backupsLoading" class="text-[0.73rem] text-secondary">{{
        dashT('dash.loadingBackups', 'Loading backups…')
      }}</span>
      <span v-else-if="backupsError" class="text-[0.73rem] text-danger-soft">{{
        dashT('dash.errorLoadingBackups', 'Error loading backups')
      }}</span>
      <span v-else-if="backups.length === 0" class="text-[0.73rem] text-secondary">{{
        dashT('dash.noBackups', 'No backups available.')
      }}</span>
      <template v-else>
        <span :class="dtMetaLblClass">{{ dashT('dash.restoreFrom', 'Restore from:') }}</span>
        <SelectRoot v-model="selectedPath">
          <SelectTrigger class="di-backup-select mx-[0.4rem]" :aria-label="dashT('dash.restoreFrom', 'Restore from:')">
            <span>{{ selectedBackupLabel }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="b in backups" :key="b.path" :value="b.path">{{ backupLabel(b) }}</SelectItem>
          </SelectContent>
        </SelectRoot>
        <Button type="button" size="sm" class="di-btn" @click="onRestoreClick">
          {{ dashT('dash.restore', 'Restore') }}
        </Button>
        <Button type="button" size="sm" class="di-btn ml-[0.3rem]" :aria-label="dashT('common.cancel', 'Cancel')" @click="backupOpen = false">
          <PbIcon :icon="PhX" :size="14" />
        </Button>
      </template>
    </div>

    <!-- confirm overlay (render.js:1331-1335, 1351-1376) -->
    <div v-show="confirmMsg !== ''" class="di-confirm absolute inset-0 z-[100] flex flex-col items-center justify-center gap-[0.8rem] bg-[var(--bg-backdrop)] p-[1.5rem] text-center">
      <div class="di-confirm-msg flex max-w-[90%] items-center justify-center gap-[0.4rem] text-[0.85rem] text-warning-soft">
        <PbIcon :icon="PhWarning" :size="16" /> {{ confirmMsg }}
      </div>
      <div class="di-confirm-btns flex gap-[0.8rem]">
        <Button type="button" size="sm" variant="success" class="di-btn di-btn-yes" @click="onConfirmYes">
          {{ dashT('common.yes', 'Yes') }}
        </Button>
        <Button type="button" size="sm" variant="danger" class="di-btn di-btn-no" @click="onConfirmNo">
          {{ dashT('common.no', 'No') }}
        </Button>
      </div>
    </div>

    <!-- status line (render.js:1337-1341, 1378-1382) -->
    <div v-show="statusMsg !== ''" class="di-status px-[0.75rem] py-[0.3rem] text-[0.73rem] text-success-soft">{{ statusMsg }}</div>
  </template>
</template>

<style scoped>
/* Row states paint the td descendants (ported from styles/widgets.css at
   the Tailwind migration — a descendant relationship utilities cannot
   express). Cascade order preserved from the legacy sheet: hover first,
   the selected tint after it. */
.di-table tbody tr:hover td {
  background: var(--bg-card);
}
.di-table tr.di-sel td {
  background: rgb(var(--accent-rgb) / 0.12);
}
.di-table tr.di-sel td:first-child {
  border-left: 3px solid var(--accent-soft);
}
</style>
