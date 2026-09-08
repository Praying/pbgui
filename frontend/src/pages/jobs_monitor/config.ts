import { getBoot, wsOrigin } from '@/shared/boot';

/** Same-origin REST base for the shared authenticated jobs API. */
export function jobsApiBase(): string {
  return `${getBoot().base_prefix}/api/jobs`;
}

/** Cookie-authenticated WebSocket URL for live jobs. */
export function jobsWsUrl(): string {
  return `${wsOrigin()}/ws/jobs`;
}
