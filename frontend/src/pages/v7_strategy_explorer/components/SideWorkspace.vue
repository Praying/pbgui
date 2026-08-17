<script setup lang="ts">
/**
 * One side's workspace — the analysis stage column (:232-243) and its
 * simulation twin (:289-300): side title, active chip, tuning column,
 * plot, and stats/fills panel.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { deepGet, esc, fmt } from '../lib/format';
import ParamTuning from './ParamTuning.vue';
import ExplorerPlot from './ExplorerPlot.vue';
import StatsPanel from './StatsPanel.vue';
import type { ExplorerStore } from '../composables/useStrategyExplorer';
import type { FillEvent } from '../types';

const props = defineProps<{
  store: ExplorerStore;
  sideKey: 'long' | 'short';
  prefix?: string;
  /** Simulation mode: fills table + sim events on the plot. */
  simMode?: string | null;
}>();
const { t } = useI18n();
const store = props.store;
const prefix = props.prefix ?? '';

const active = computed(() => !!deepGet<boolean>(store.state.snapshot, ['sides', props.sideKey, 'active'], false));
const simEvents = computed<FillEvent[] | null>(() => (props.simMode ? deepGet<FillEvent[]>(store.state.simulations, [props.simMode, 'events', props.sideKey], []) : null));

/** The sim plot uses the simulation snapshot override on the v8 flavour (:2071-2083). */
const simSnapshot = computed(() => {
  if (!props.simMode || !store.state.snapshot) return null;
  const data = store.state.simulations[props.simMode];
  return data ? store.simulationSnapshotForPlot(data) : null;
});

interface FillRow {
  idx: number;
  time: string;
  event: string;
  qty: string;
  price: string;
  posSize: string;
}
function fillRows(): FillRow[] {
  const events = simEvents.value || [];
  return (events.slice(0, 500) as FillEvent[]).map((ev, idx) => ({
    idx: idx + 1,
    time: String(ev.timestamp || ev.time || ev.date || '-'),
    event: String(ev.event || ev.type || ev.order_type || '-'),
    qty: fmt(ev.qty, 8),
    price: fmt(ev.price, 8),
    posSize: fmt(ev.pos_size, 8),
  }));
}
void esc;
</script>

<template>
  <section class="main-column" :id="(prefix || '') + (simMode ? 'sim-' : '') + sideKey + '-workspace'">
    <div class="side-title">
      <h3>{{ sideKey.toUpperCase() }}</h3>
      <span :id="(prefix || '') + (simMode ? 'sim-' : '') + sideKey + '-active-chip'" class="chip" :class="active ? 'ok' : 'warn'">
        {{ active ? t('v7explore.active') : t('v7explore.inactive') }}
      </span>
    </div>
    <ParamTuning :store="store" :side-key="sideKey" :prefix="prefix || (simMode ? 'sim-' : '')" />
    <ExplorerPlot
      :store="store"
      :side-key="sideKey"
      :plot-id="(prefix || '') + (simMode ? 'sim-' : '') + 'plot-' + sideKey"
      :sim-events="simEvents"
      :snapshot-override="simSnapshot"
    />
    <template v-if="simMode">
      <section class="panel-card">
        <h4>{{ sideKey === 'long' ? t('v7explore.longFills') : t('v7explore.shortFills') }}</h4>
        <div :id="'sim-' + sideKey">
          <table v-if="fillRows().length" class="orders">
            <thead><tr><th>#</th><th>Time</th><th>Event</th><th>Qty</th><th>Price</th><th>Pos Size</th></tr></thead>
            <tbody>
              <tr v-for="row in fillRows()" :key="row.idx"><td>{{ row.idx }}</td><td>{{ row.time }}</td><td>{{ row.event }}</td><td>{{ row.qty }}</td><td>{{ row.price }}</td><td>{{ row.posSize }}</td></tr>
            </tbody>
          </table>
          <table v-else class="orders"><tbody><tr><td class="muted" style="text-align:left">{{ t('v7explore.noFills') }}</td></tr></tbody></table>
        </div>
      </section>
    </template>
    <StatsPanel v-else :store="store" :side-key="sideKey" />
  </section>
</template>
