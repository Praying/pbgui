/**
 * Service registry ported 1:1 from the legacy frontend/services_monitor.html
 * main script. guideKeyword drives window._servicesGuideKeyword for the help
 * overlay opener (legacy SERVICES entries carried the same field).
 */
export interface ServiceDef {
  id: string;
  label: string;
  logFile: string;
  isApiServer: boolean;
  guideKeyword: string;
}

export const SERVICES: ServiceDef[] = [
  { id: 'pbcluster',      label: 'PBCluster',      logFile: 'PBCluster.log',      isApiServer: false, guideKeyword: 'cluster_sync' },
  { id: 'pbrun',          label: 'PBRun',          logFile: 'PBRun.log',          isApiServer: false, guideKeyword: 'pbrun_service' },
  { id: 'pbdata',         label: 'PBData',         logFile: 'PBData.log',         isApiServer: false, guideKeyword: 'pbdata' },
  { id: 'pbcoindata',     label: 'PBCoinData',     logFile: 'PBCoinData.log',     isApiServer: false, guideKeyword: 'pbcoindata_service' },
  { id: 'monitor-agent',  label: 'PBMonitorAgent', logFile: 'PBMonitorAgent.log', isApiServer: false, guideKeyword: 'vps_monitor' },
  { id: 'vps-monitor',    label: 'VPSMonitor',     logFile: 'VPSMonitor.log',     isApiServer: false, guideKeyword: 'pbapiserver' },
  { id: 'api-server',     label: 'PBAPIServer',    logFile: 'PBApiServer.log',    isApiServer: true,  guideKeyword: 'pbapiserver' },
];
