/**
 * Service registry ported 1:1 from the legacy frontend/services_monitor.html
 * main script. guideKeyword arrives with its consumer (help overlay later).
 */
export interface ServiceDef {
  id: string;
  label: string;
  logFile: string;
  isApiServer: boolean;
}

export const SERVICES: ServiceDef[] = [
  { id: 'pbcluster',      label: 'PBCluster',      logFile: 'PBCluster.log',      isApiServer: false },
  { id: 'pbrun',          label: 'PBRun',          logFile: 'PBRun.log',          isApiServer: false },
  { id: 'pbdata',         label: 'PBData',         logFile: 'PBData.log',         isApiServer: false },
  { id: 'pbcoindata',     label: 'PBCoinData',     logFile: 'PBCoinData.log',     isApiServer: false },
  { id: 'monitor-agent',  label: 'PBMonitorAgent', logFile: 'PBMonitorAgent.log', isApiServer: false },
  { id: 'vps-monitor',    label: 'VPSMonitor',     logFile: 'VPSMonitor.log',     isApiServer: false },
  { id: 'api-server',     label: 'PBAPIServer',    logFile: 'PBApiServer.log',    isApiServer: true },
];
