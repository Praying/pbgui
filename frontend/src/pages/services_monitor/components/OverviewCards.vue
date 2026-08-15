<script setup lang="ts">
/*
 * Overview cards grid, ported from the legacy renderOverviewCards +
 * renderServiceButtons(compact) / serviceStatus* helpers of
 * frontend/services_monitor.html. The workers and migration summary cards
 * render with their legacy initial values (zero counts / not loaded) until
 * Tasks 10 and 14 wire their fetches.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { SERVICES } from '../services';
import {
  migrationStatusMeta,
  serviceActionProgressText,
  serviceSkipped,
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
  /** Legacy button icons: ▶ start, ■ stop, ↻ restart; enable/disable/open have none. */
  icon: '' | '▶' | '■' | '↻';
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

/** Legacy renderServiceButtons(compact) row for one service. */
function serviceButtons(svcId: string, isApiServer: boolean, item: NonNullable<ServiceStatusMap[string]>, pending: ServiceAction | null): CardButton[] {
  const buttons: CardButton[] = [];
  const make = (kind: ServiceAction): CardButton => ({
    kind,
    label: pending === kind ? serviceActionProgressText(tt, pending) : t(`sysmon.${kind}`),
    icon: kind === 'start' ? '▶' : kind === 'stop' ? '■' : kind === 'restart' ? '↻' : '',
    // Legacy disabledAttr: any pending action disables every button of the service.
    disabled: pending !== null,
    action: kind,
  });
  if (!serviceSkipped(item)) {
    if (isApiServer) {
      // api-server restart routes to the legacy restartApiServer flow in App.
      buttons.push(item.running ? make('restart') : make('start'));
    } else if (item.running) {
      buttons.push(make('stop'), make('restart'));
    } else {
      buttons.push(make('start'));
    }
  }
  if (item.can_enable) {
    if (item.enabled) buttons.push(make('disable'));
    else if (!item.enable_blocked_reason) buttons.push(make('enable'));
  }
  return buttons;
}

const openButton: CardButton = { kind: 'open', label: '', icon: '', disabled: false, action: null };

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
      buttons: serviceButtons(svc.id, svc.isApiServer, item, pending),
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
      class="svc-card"
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
          class="card-btn"
          :class="b.kind"
          type="button"
          :disabled="b.disabled"
          @click.stop="b.action ? emit('action', c.svcId, b.action) : emit('select', c.panelId)"
        >
          <template v-if="b.icon">{{ b.icon }} </template>{{ b.label }}
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
  background: #131b2b;
  border: 1px solid #1e2736;
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  cursor: pointer;
  transition: border-color 0.12s;
}
.svc-card:hover { border-color: #2d3748; }
.svc-card.running { border-color: rgba(33, 195, 84, 0.45); }
.svc-card.stopped { border-color: rgba(255, 75, 75, 0.35); }
.card-name { font-size: var(--fs-sm); font-weight: 700; color: #e2e8f0; }
.card-status-row { display: flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: #64748b; }
.card-dot { width: 7px; height: 7px; border-radius: 50%; background: #4a5568; flex-shrink: 0; }
.card-dot.running { background: #21c354; }
.card-dot.stopped { background: #ff4b4b; }
.card-dot.warn { background: #f59e0b; }
/* Legacy inline style on the buttons wrapper div. */
.card-buttons { display: flex; gap: 4px; flex-wrap: wrap; }
.card-btn {
  align-self: flex-start;
  padding: 0.2rem 0.65rem;
  border-radius: 4px;
  border: 1px solid #2d3748;
  background: #1a202c;
  color: #94a3b8;
  cursor: pointer;
  font-size: var(--fs-xs);
  font-family: inherit;
  transition: all 0.12s;
}
.card-btn:hover:not(:disabled) { border-color: #4a5568; color: #e2e8f0; }
.card-btn.start { border-color: #166534; color: #4ade80; background: #052e16; }
.card-btn.stop { border-color: #7f1d1d; color: #fca5a5; background: #2d1515; }
.card-btn.restart { border-color: #b45309; color: #fcd34d; background: #1c1a08; }
.card-btn.enable { border-color: #1d4ed8; color: #93c5fd; background: #10213f; }
.card-btn.disable { border-color: #475569; color: #cbd5e1; background: #1e293b; }
@media (max-width: 640px) {
  .overview-grid { grid-template-columns: 1fr; }
}
</style>
