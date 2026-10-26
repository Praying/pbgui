/**
 * Pure status-rendering helpers, ported 1:1 from the legacy
 * frontend/services_monitor.html script (serviceSkipped/serviceStatusClass/
 * serviceStatusText/serviceStatusTitle/migrationStatusMeta). Translation is
 * injected so the helpers stay usable from both components and tests.
 */
import type { MigrationStatus, ServiceAction, ServiceStatus } from './types';

/** vue-i18n-compatible translator: t(key) or t(key, named). */
export type Translate = (key: string, named?: Record<string, string | number>) => string;

/** Transitional or uncertain ownership must not be presented as intentionally skipped. */
export function serviceSkipped(item: ServiceStatus): boolean {
  return item.expected === false && !item.running
    && !['starting', 'stopping', 'unknown', 'failed'].includes(item.actual_status || '');
}

/** Legacy serviceStatusClass: '' for skipped, otherwise running/stopped. */
export function serviceStatusClass(item: ServiceStatus): string {
  if (['starting', 'stopping', 'unknown'].includes(item.actual_status || '')) return 'warn';
  if (item.actual_status === 'failed') return 'stopped';
  return serviceSkipped(item) ? '' : item.running ? 'running' : 'stopped';
}

/** Legacy serviceActionProgressText — the in-flight suffix shown while an action is pending. */
export function serviceActionProgressText(t: Translate, action: ServiceAction): string {
  switch (action) {
    case 'restart': return t('sysmon.restarting');
    case 'start': return t('sysmon.starting');
    case 'stop': return t('sysmon.stopping');
    case 'enable': return t('sysmon.enabling');
    case 'disable': return t('sysmon.disabling');
  }
}

/** Legacy serviceActionDoneText — success popup detail per action. */
export function serviceActionDoneText(t: Translate, action: ServiceAction, svcId: string): string {
  switch (action) {
    case 'restart': return t('sysmon.restartRequested', { svc: svcId });
    case 'start': return t('sysmon.startRequested', { svc: svcId });
    case 'stop': return t('sysmon.stopRequested', { svc: svcId });
    case 'enable': return t('sysmon.autostartEnabled', { svc: svcId });
    case 'disable': return t('sysmon.autostartDisabled', { svc: svcId });
  }
}

/** Legacy serviceStatusText: base state, optional enable/disable suffix, optional progress suffix. */
export function serviceStatusText(
  t: Translate,
  item: ServiceStatus,
  pending: ServiceAction | null = null
): string {
  let base = serviceSkipped(item)
    ? t('sysmon.skippedStatus')
    : item.running
      ? t('sysmon.running')
      : t('sysmon.stopped');
  if (item.actual_status === 'starting') base = t('sysmon.starting');
  if (item.actual_status === 'stopping') base = t('sysmon.stopping');
  if (item.actual_status === 'unknown') base = t('common.unknown');
  if (item.actual_status === 'failed') base = t('sysmon.failed');
  if (item.can_enable) {
    base += ' · ' + (item.enabled ? t('common.enabled') : t('common.disabled'));
  }
  if (pending) base += ' · ' + serviceActionProgressText(t, pending);
  return base;
}

/** Legacy serviceStatusTitle: systemd detail tooltip, newline-joined. */
export function serviceStatusTitle(t: Translate, item: ServiceStatus): string {
  const parts: string[] = [];
  if (item.reason) parts.push(item.reason);
  if (item.error) parts.push(item.error);
  if (item.unit) parts.push(t('sysmon.unit', { v: item.unit }));
  if (item.systemd_state) parts.push(t('sysmon.stateColon', { v: item.systemd_state }));
  if (item.systemd_enabled_state) parts.push(t('sysmon.autostartColon', { v: item.systemd_enabled_state }));
  return parts.join('\n');
}

export interface ServiceButton {
  action: ServiceAction;
  label: string;
  disabled: boolean;
}

/**
 * Legacy renderServiceButtons - one shared row for the overview cards (compact)
 * and the per-panel ctrl strips. Any pending action disables every button and
 * swaps the matching label for its progress text.
 */
export function serviceButtons(
  t: Translate,
  isApiServer: boolean,
  item: ServiceStatus,
  pending: ServiceAction | null
): ServiceButton[] {
  const buttons: ServiceButton[] = [];
  const make = (action: ServiceAction): ServiceButton => ({
    action,
    label: pending === action ? serviceActionProgressText(t, pending) : t(`sysmon.${action}`),
    disabled: pending !== null,
  });
  if (['starting', 'stopping', 'unknown'].includes(item.actual_status || '')) {
    if (item.can_stop) buttons.push(make('stop'));
    buttons.push({ ...make('start'), disabled: true }, { ...make('restart'), disabled: true });
    if (item.can_enable && !item.enabled) buttons.push({ ...make('enable'), disabled: true });
    return buttons;
  }
  if (!serviceSkipped(item)) {
    if (isApiServer) {
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

export interface MigrationStatusMeta {
  cls: string;
  label: string;
  text: string;
  needed: boolean;
}

/** Legacy migrationStatusMeta — drives the migration summary card (Task 14 adds the panel). */
export function migrationStatusMeta(t: Translate, data: MigrationStatus | null): MigrationStatusMeta {
  if (!data) return { cls: '', label: t('sysmon.notLoaded'), text: t('sysmon.migrationNotLoaded'), needed: false };
  if (data._restart_pending) return { cls: 'warn', label: t('sysmon.restartingStatus'), text: t('sysmon.apiRestartInProgress'), needed: false };
  if (data._error) return { cls: 'stopped', label: t('common.error'), text: data._error, needed: false };
  const warnings = data.warnings ?? [];
  if (data.migration_needed) return { cls: 'warn', label: t('sysmon.needed'), text: t('sysmon.migrationAvailable'), needed: true };
  if (warnings.length > 0) return { cls: 'warn', label: t('sysmon.warnings'), text: t('sysmon.migrationWarnings'), needed: false };
  return { cls: 'running', label: t('sysmon.ready'), text: t('sysmon.alreadyManaged'), needed: false };
}
