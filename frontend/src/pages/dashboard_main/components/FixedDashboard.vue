<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { getBoot } from '@/shared/boot';
import { useDashboardWs } from '@/pages/dashboard_editor/composables/useDashboardWs';
import { useDashboardUsers } from '@/pages/dashboard_editor/composables/useDashboardUsers';
import {
  dashboardFilterSelectionKey,
  dashboardUserSelectionKey,
  type DashboardFilterSelectionContext,
  type DashboardUserSelectionContext,
} from '@/pages/dashboard_editor/composables/useDashboardUserSelection';
import { MODES, periodFromSelect } from '@/pages/dashboard_editor/composables/usePeriodControls';
import { isPositionsLive } from '@/pages/dashboard_editor/lib/livePositionsRegistry';
import { useDashboardStore } from '@/pages/dashboard_editor/stores/dashboardStore';
import WidgetAdg from '@/pages/dashboard_editor/components/widgets/WidgetAdg.vue';
import WidgetBalance from '@/pages/dashboard_editor/components/widgets/WidgetBalance.vue';
import WidgetIncome from '@/pages/dashboard_editor/components/widgets/WidgetIncome.vue';
import WidgetPnl from '@/pages/dashboard_editor/components/widgets/WidgetPnl.vue';
import WidgetPositions from '@/pages/dashboard_editor/components/widgets/WidgetPositions.vue';
import WidgetTop from '@/pages/dashboard_editor/components/widgets/WidgetTop.vue';
import MultiSelectDropdown from '@/pages/dashboard_editor/components/MultiSelectDropdown.vue';
import PeriodControls from '@/pages/dashboard_editor/components/widgets/PeriodControls.vue';
import { dtCtrlSelClass, dtMetaLblClass, dtMetaSepClass } from '@/pages/dashboard_editor/components/widgets/uiClasses';
import FixedWidgetCell from './FixedWidgetCell.vue';

const { t } = useI18n();

const apiBase = `${getBoot().base_prefix}/api`;
const dashboardUsers = useDashboardUsers();
const allUsers = dashboardUsers.users;
const selectedUsers = ref<string[]>(['ALL']);
const selectedPeriod = ref('THIS_MONTH');
const selectedMode = ref('bar');
const userSelection: DashboardUserSelectionContext = {
  users: selectedUsers,
  allUsers: dashboardUsers.users,
  setUsers: (nextUsers) => {
    selectedUsers.value = nextUsers.length ? [...nextUsers] : ['ALL'];
  },
};
provide(dashboardUserSelectionKey, userSelection);

const filterSelection: DashboardFilterSelectionContext = {
  period: selectedPeriod,
  mode: selectedMode,
  setPeriod: (nextPeriod) => {
    selectedPeriod.value = nextPeriod;
  },
  setMode: (nextMode) => {
    selectedMode.value = nextMode;
  },
};
provide(dashboardFilterSelectionKey, filterSelection);

function onPeriodChange(value: string): void {
  selectedPeriod.value = periodFromSelect(value);
}

function onModeChange(value: unknown): void {
  selectedMode.value = String(value);
}

/** Chart-mode display labels — the store keeps the raw 'bar'/'line' values. */
function modeLabel(mode: string): string {
  if (mode === 'bar') return t('dash.modeBar');
  if (mode === 'line') return t('dash.modeLine');
  return mode;
}

const store = useDashboardStore({
  apiBase,
  origName: '__fixed_overview__',
  viewOnly: true,
  standalone: false,
  fetchFn: async () => ({ ok: true }),
});

store.loadConfig({
  name: '__fixed_overview__',
  rows: 4,
  cols: 2,
  dashboard_type_1_1: 'BALANCE',
  dashboard_type_2_1: 'PNL',
  dashboard_type_2_2: 'ADG',
  dashboard_type_3_1: 'POSITIONS',
  dashboard_type_4_1: 'INCOME',
  dashboard_type_4_2: 'TOP',
});

useDashboardWs({
  apiBase,
  store,
  isPositionsLive,
});

onMounted(() => {
  document.documentElement.classList.add('dashboard-overview-page');
  void dashboardUsers.loadUsers(apiBase);
});

onUnmounted(() => {
  document.documentElement.classList.remove('dashboard-overview-page');
});
</script>

<template>
  <div class="dashboard-overview">
    <div class="overview-intro">
      <div>
        <p class="overview-eyebrow">{{ t('dash.fixedLayout') }}</p>
        <h2>{{ t('dash.fixedOverview') }}</h2>
        <p class="overview-copy">{{ t('dash.fixedOverviewDescription') }}</p>
      </div>
      <div class="overview-actions">
        <div class="overview-pill overview-filter-group" data-test="shared-dashboard-filters">
          <div class="overview-filter-control" data-test="shared-period-selector">
            <PeriodControls :period="selectedPeriod" @update:period="onPeriodChange" />
          </div>
          <!-- Mode is one atomic unit so the group wrap can never split its
               label from the select. -->
          <div class="overview-filter-control">
            <span :class="dtMetaSepClass">·</span>
            <span :class="dtMetaLblClass">{{ t('dash.mode') }}</span>
            <SelectRoot
              :model-value="selectedMode"
              @update:model-value="onModeChange"
            >
              <SelectTrigger
                :class="dtCtrlSelClass"
                :aria-label="t('dash.mode')"
                data-test="shared-mode-selector"
              >
                <span>{{ modeLabel(selectedMode) }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="mode in MODES" :key="mode" :value="mode">{{ modeLabel(mode) }}</SelectItem>
              </SelectContent>
            </SelectRoot>
          </div>
        </div>
        <div class="overview-pill overview-user-filter" data-test="shared-user-selector">
          <span :class="dtMetaLblClass">{{ t('dash.users') }}</span>
          <MultiSelectDropdown
            v-model="selectedUsers"
            :users="allUsers"
            :aria-label="t('dash.users')"
          />
        </div>
        <div class="overview-pill overview-rhythm" :aria-label="t('dash.live')">
          <span class="overview-rhythm__dot" aria-hidden="true" />
          <span>{{ t('dash.live') }}</span>
        </div>
      </div>
    </div>

    <div class="overview-grid">
      <FixedWidgetCell :row="1" :col="1" :widget="WidgetBalance" class="overview-grid__balance" />

      <div class="overview-section-label overview-grid__performance">
        <span>{{ t('dash.performance') }}</span>
        <span class="overview-section-label__line" aria-hidden="true" />
      </div>
      <FixedWidgetCell :row="2" :col="1" :widget="WidgetPnl" />
      <FixedWidgetCell :row="2" :col="2" :widget="WidgetAdg" />

      <div class="overview-section-label overview-grid__risk">
        <span>{{ t('dash.riskAndExecution') }}</span>
        <span class="overview-section-label__line" aria-hidden="true" />
      </div>
      <FixedWidgetCell :row="3" :col="1" :widget="WidgetPositions" class="overview-grid__positions" />

      <div class="overview-section-label overview-grid__activity">
        <span>{{ t('dash.activity') }}</span>
        <span class="overview-section-label__line" aria-hidden="true" />
      </div>
      <FixedWidgetCell :row="4" :col="1" :widget="WidgetIncome" />
      <FixedWidgetCell :row="4" :col="2" :widget="WidgetTop" />
    </div>
  </div>
</template>

<style scoped>
.dashboard-overview {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  overflow: auto;
  padding: var(--page-padding);
  background:
    radial-gradient(circle at 82% 0%, rgb(var(--accent-rgb) / 0.08), transparent 30rem),
    var(--bg-page);
}

.overview-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-lg);
  margin-bottom: var(--sp-lg);
}

.overview-eyebrow {
  margin: 0 0 5px;
  color: var(--accent-soft);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.overview-intro h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--text-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
  text-wrap: balance;
}

.overview-copy {
  max-width: 34rem;
  margin: 7px 0 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.5;
  text-wrap: pretty;
}

.overview-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--sp-sm);
}

/* Shared capsule chrome for the period/mode, user and live pills — one
   padding, one gap and one min-height so the row keeps a single baseline
   (the min-height matches the h-8 select + 5px padding + borders). */
.overview-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-sm);
  min-height: 2.75rem;
  padding: 5px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-panel);
}

/* Tone override — must follow .overview-pill so it wins the border-color
   and background equal-specificity race. */
.overview-rhythm {
  flex: 0 0 auto;
  border-color: rgb(var(--success-rgb) / 0.25);
  background: rgb(var(--success-rgb) / 0.07);
  color: var(--success-soft);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.overview-filter-group {
  flex-wrap: wrap;
}

.overview-filter-control {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-sm);
}

/* Host sizing for the page-level user pill — MultiSelectDropdown's root
   carries w-full, and its .dt-meta-controls host rule does not apply here.
   width: auto sizes the dropdown to its content; the max-width keeps long
   user lists truncating instead of stretching the pill row. */
.overview-user-filter :deep(.msel-wrap) {
  width: auto;
  max-width: 14rem;
}

.overview-rhythm__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px rgb(var(--success-rgb) / 0.13);
  animation: overview-live-pulse 2.4s var(--ease-standard) infinite;
}

/* The live indicator breathes between a tight and a soft success ring. */
@keyframes overview-live-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgb(var(--success-rgb) / 0.13);
  }

  50% {
    box-shadow: 0 0 0 6px rgb(var(--success-rgb) / 0.04);
  }
}

.overview-grid {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--component-gap);
  padding-bottom: var(--sp-lg);
}

.overview-grid__balance,
.overview-grid__positions,
.overview-section-label {
  grid-column: 1 / -1;
}

.overview-section-label {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: 3px 2px 0;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.overview-section-label__line {
  height: 1px;
  flex: 1;
  background: var(--border-subtle);
}

@media (max-width: 920px) {
  .overview-intro {
    align-items: flex-start;
    flex-direction: column;
  }

  .overview-rhythm {
    align-self: flex-start;
  }

  .overview-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .dashboard-overview {
    padding: 12px;
  }

  .overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .overview-grid__balance,
  .overview-grid__positions,
  .overview-section-label {
    grid-column: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .overview-rhythm__dot {
    animation: none;
    box-shadow: none;
  }
}
</style>
