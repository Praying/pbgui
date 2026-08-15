/**
 * Pure status-rendering helpers, ported 1:1 from the legacy
 * frontend/services_monitor.html script (serviceSkipped/serviceStatusClass/
 * serviceStatusText/serviceStatusTitle/migrationStatusMeta). Translation is
 * injected so the helpers stay usable from both components and tests.
 */
import type { MigrationStatus, ServiceAction, ServiceStatus } from './types';

/** vue-i18n-compatible translator: t(key) or t(key, named). */
export type Translate = (key: string, named?: Record<string, string | number>) => string;

/** Legacy serviceSkipped: `expected === false && !running` renders as "Skipped". */
export function serviceSkipped(item: ServiceStatus): boolean {
  return item.expected === false && !item.running;
}

/** Legacy serviceStatusClass: '' for skipped, otherwise running/stopped. */
export function serviceStatusClass(item: ServiceStatus): string {
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
  if (item.unit) parts.push(t('sysmon.unit', { v: item.unit }));
  if (item.systemd_state) parts.push(t('sysmon.stateColon', { v: item.systemd_state }));
  if (item.systemd_enabled_state) parts.push(t('sysmon.autostartColon', { v: item.systemd_enabled_state }));
  return parts.join('\n');
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
