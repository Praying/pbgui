import { computed, inject, type Ref } from 'vue';
import { useDashboardUsers } from './useDashboardUsers';
import { periodFromSelect } from './usePeriodControls';
import type { DashboardStore } from '../stores/dashboardStore';

export interface DashboardUserSelectionContext {
  users: Ref<string[]>;
  allUsers: Ref<string[]>;
  setUsers: (users: string[]) => void;
}

export const dashboardUserSelectionKey = Symbol('dashboard-user-selection');

export interface DashboardFilterSelectionContext {
  period: Ref<string>;
  mode: Ref<string>;
  setPeriod: (period: string) => void;
  setMode: (mode: string) => void;
}

export const dashboardFilterSelectionKey = Symbol('dashboard-filter-selection');

export function useDashboardUserSelection(
  key: string,
  store: DashboardStore,
): {
  users: Ref<string[] | null>;
  allUsers: Ref<string[]>;
  isShared: boolean;
  onUsersChange: (users: string[]) => void;
} {
  const shared = inject<DashboardUserSelectionContext | null>(dashboardUserSelectionKey, null);
  if (shared) {
    return {
      users: shared.users,
      allUsers: shared.allUsers,
      isShared: true,
      onUsersChange: shared.setUsers,
    };
  }

  const users = computed<string[] | null>(() => {
    const value = store.state[key];
    return Array.isArray(value) ? (value as string[]) : null;
  });
  const allUsers = useDashboardUsers().users;

  return {
    users,
    allUsers,
    isShared: false,
    onUsersChange: (nextUsers) => {
      store.state[key] = nextUsers;
      store.scheduleSync();
    },
  };
}

export function useDashboardPeriodSelection(
  periodKey: string,
  store: DashboardStore,
): {
  period: Ref<string>;
  isShared: boolean;
  onPeriodChange: (period: string) => void;
} {
  const shared = inject<DashboardFilterSelectionContext | null>(dashboardFilterSelectionKey, null);
  if (shared) {
    return {
      period: shared.period,
      isShared: true,
      onPeriodChange: (period) => shared.setPeriod(periodFromSelect(period)),
    };
  }

  const period = computed<string>(() => String(store.state[periodKey] || 'THIS_MONTH'));
  return {
    period,
    isShared: false,
    onPeriodChange: (nextPeriod) => {
      store.state[periodKey] = periodFromSelect(nextPeriod);
      store.scheduleSync();
    },
  };
}

export function useDashboardModeSelection(
  modeKey: string,
  store: DashboardStore,
): {
  mode: Ref<string>;
  isShared: boolean;
  onModeChange: (mode: unknown) => void;
} {
  const shared = inject<DashboardFilterSelectionContext | null>(dashboardFilterSelectionKey, null);
  if (shared) {
    return {
      mode: shared.mode,
      isShared: true,
      onModeChange: (mode) => shared.setMode(String(mode)),
    };
  }

  const mode = computed<string>(() => String(store.state[modeKey] || 'bar'));
  return {
    mode,
    isShared: false,
    onModeChange: (nextMode) => {
      store.state[modeKey] = String(nextMode);
      store.scheduleSync();
    },
  };
}
