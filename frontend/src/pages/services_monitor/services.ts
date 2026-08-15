/**
 * Service registry ported 1:1 from the legacy frontend/services_monitor.html
 * main script. logFile/guideKeyword arrive with their consumers (log viewer in
 * Task 10, help overlay later).
 */
export interface ServiceDef {
  id: string;
  label: string;
  isApiServer: boolean;
}

export const SERVICES: ServiceDef[] = [
  { id: 'pbcluster',      label: 'PBCluster',      isApiServer: false },
  { id: 'pbrun',          label: 'PBRun',          isApiServer: false },
  { id: 'pbdata',         label: 'PBData',         isApiServer: false },
  { id: 'pbcoindata',     label: 'PBCoinData',     isApiServer: false },
  { id: 'monitor-agent',  label: 'PBMonitorAgent', isApiServer: false },
  { id: 'vps-monitor',    label: 'VPSMonitor',     isApiServer: false },
  { id: 'api-server',     label: 'PBAPIServer',    isApiServer: true },
];
