import { getBoot } from '@/shared/boot';

/** Same-origin Cluster Sync REST endpoint. */
export function clusterApiBase(): string { return `${getBoot().base_prefix}/api/cluster`; }
