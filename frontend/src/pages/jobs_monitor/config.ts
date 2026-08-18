import { getBoot } from '@/shared/boot';

/** Same-origin REST base for the shared authenticated jobs API. */
export function jobsApiBase(): string {
  return `${getBoot().origin}/api/jobs`;
}

/** Cookie-authenticated WebSocket URL for live jobs. */
export function jobsWsUrl(): string {
  return `${getBoot().origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws/jobs`;
}
