<script setup lang="ts">
/*
 * Overview cards grid, ported from the legacy renderOverviewCards +
 * renderServiceButtons(compact) / serviceStatus* helpers of
 * frontend/services_monitor.html. The workers and migration summary cards
 * render with their legacy initial values (zero counts / not loaded) until
 * Tasks 10 and 14 wire their fetches.
 */
import { computed } from 'vue';
import { PhArrowClockwise, PhArrowRight, PhPlay, PhStop, PhToggleLeft, PhToggleRight } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { SERVICES } from '../services';
import {
  migrationStatusMeta,
  serviceButtons,
  serviceStatusClass,
  serviceStatusText,
  serviceStatusTitle,
  type Translate,
} from '../status';
import type { MigrationStatus, ServiceAction, ServiceStatusMap } from '../types';

interface Props {
  statuses: ServiceStatusMap;
  /** svcId → in-flight action; disables that card's buttons and appends progress text. */
  pending?: Record<string, ServiceAction>;
  /** Worker counts for the workers summary card (Task 10 wires the fetch). */
  workersCounts?: { total?: number; running?: number };
  /** Migration status for the migration summary card (Task 14 wires the fetch). */
  migrationStatus?: MigrationStatus | null;
}

const props = withDefaults(defineProps<Props>(), {
  pending: () => ({}),
  workersCounts: () => ({ total: 0, running: 0 }),
  migrationStatus: null,
});

const emit = defineEmits<{
  action: [svcId: string, action: ServiceAction];
  select: [panelId: string];
}>();

const { t } = useI18n();
const tt: Translate = (key, named) => (named ? t(key, named) : t(key));

type ButtonKind = ServiceAction | 'open';

interface CardButton {
  kind: ButtonKind;
  label: string;
  disabled: boolean;
  action: ServiceAction | null;
}
interface Card {
  svcId: string;
  panelId: string;
  name: string;
  /** Border/status class; the migration card drops it on warn. */
  cls: string;
  /** Dot class — the migration card keeps its raw class (warn dot) even without a border class. */
  dotCls: string;
  statusText: string;
  title: string;
  buttons: CardButton[];
}

/** Legacy renderServiceButtons(compact) row for one service (logic in ../status). */
function cardButtons(
  isApiServer: boolean,
  item: NonNullable<ServiceStatusMap[string]>,
  pending: ServiceAction | null
): CardButton[] {
  return serviceButtons(tt, isApiServer, item, pending).map((b) => ({
    kind: b.action,
    label: b.label,
    disabled: b.disabled,
    action: b.action,
  }));
}

const buttonIcons = {
  start: PhPlay,
  stop: PhStop,
  restart: PhArrowClockwise,
  enable: PhToggleRight,
  disable: PhToggleLeft,
  open: PhArrowRight,
} as const;

const openButton: CardButton = { kind: 'open', label: '', disabled: false, action: null };

const cards = computed<Card[]>(() => {
  const list: Card[] = SERVICES.map((svc) => {
    const item = props.statuses[svc.id] ?? {};
    const pending = props.pending[svc.id] ?? null;
    return {
      svcId: svc.id,
      panelId: svc.id,
      name: svc.label,
      cls: serviceStatusClass(item),
      dotCls: serviceStatusClass(item),
      statusText: serviceStatusText(tt, item, pending),
      title: serviceStatusTitle(tt, item),
      buttons: cardButtons(svc.isApiServer, item, pending),
    };
  });

  // Workers summary card — legacy renders it from _workers.counts.
  const counts = props.workersCounts ?? {};
  const workersCls = Number(counts.running || 0) > 0 ? 'running' : 'stopped';
  list.push({
    svcId: 'workers',
    panelId: 'workers',
    name: t('sysmon.workers'),
    cls: workersCls,
    dotCls: workersCls,
    statusText: t('sysmon.workersRunning', { running: counts.running || 0, total: counts.total || 0 }),
    title: '',
    buttons: [{ ...openButton, label: t('sysmon.open') }],
  });

  // Migration summary card — legacy: migrationCls = meta.cls || 'stopped'; the
  // border class is dropped on warn but the dot keeps the raw class.
  const meta = migrationStatusMeta(tt, props.migrationStatus ?? null);
  const migrationCls = meta.cls || 'stopped';
  list.push({
    svcId: 'migration',
    panelId: 'migration',
    name: t('sysmon.migration'),
    cls: migrationCls === 'warn' ? '' : migrationCls,
    dotCls: migrationCls,
    statusText: meta.text,
    title: '',
    buttons: [{ ...openButton, label: t('sysmon.open') }],
  });

  return list;
});
</script>

<template>
  <div id="overview-grid" class="overview-grid">
    <div
      v-for="c in cards"
      :key="c.svcId"
      class="svc-card pbgui-card"
      :class="c.cls"
      :data-svc="c.svcId"
      @click="emit('select', c.panelId)"
    >
      <div class="card-name">{{ c.name }}</div>
      <div class="card-status-row" :title="c.title"><span class="card-dot" :class="c.dotCls"></span>{{ c.statusText }}</div>
      <div class="card-buttons">
        <button
          v-for="b in c.buttons"
          :key="b.kind"
          class="card-btn pbgui-action"
          :class="b.kind"
          type="button"
          :disabled="b.disabled"
          @click.stop="b.action ? emit('action', c.svcId, b.action) : emit('select', c.panelId)"
        >
          <PbIcon :icon="buttonIcons[b.kind]" />
          {{ b.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<!-- Card styles ported from frontend/services_monitor.html (overview section);
     the grid's padding/overflow mirror the legacy inline style on #overview-grid. -->
<style scoped>
.overview-grid {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 1rem;
  align-content: start;
}
.svc-card {
  background: var(--bg-page);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  cursor: pointer;
  transition: border-color 0.12s;
}
.svc-card:hover { border-color: var(--border-default); }
.svc-card.running { border-color: rgb(var(--success-rgb) / 0.45); }
.svc-card.stopped { border-color: rgb(var(--danger-rgb) / 0.35); }
.card-name { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); }
.card-status-row { display: flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--text-muted); }
.card-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-disabled); flex-shrink: 0; }
.card-dot.running { background: var(--success); }
.card-dot.stopped { background: var(--danger); }
.card-dot.warn { background: var(--warning); }
/* Legacy inline style on the buttons wrapper div. */
.card-buttons { display: flex; gap: 4px; flex-wrap: wrap; }
.card-btn {
  align-self: flex-start;
  padding: 0.2rem 0.65rem;
  border-radius: 4px;
  border: 1px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--fs-xs);
  font-family: inherit;
  transition: all 0.12s;
}
.card-btn:hover:not(:disabled) { border-color: var(--border-strong); color: var(--text-primary); }
.card-btn.start { border-color: var(--success-deep); color: var(--success); background: color-mix(in srgb, var(--success-deep) 28%, var(--bg-card)); }
.card-btn.stop { border-color: var(--danger-deep); color: var(--danger-soft); background: color-mix(in srgb, var(--danger-deep) 28%, var(--bg-card)); }
.card-btn.restart { border-color: var(--warning-deep); color: var(--warning-soft); background: color-mix(in srgb, var(--warning-deep) 28%, var(--bg-card)); }
.card-btn.enable { border-color: var(--accent-deep); color: var(--accent-soft); background: color-mix(in srgb, var(--accent-deep) 28%, var(--bg-card)); }
.card-btn.disable { border-color: var(--border-strong); color: var(--text-secondary); background: var(--bg-panel); }
@media (max-width: 640px) {
  .overview-grid { grid-template-columns: 1fr; }
}
</style>
