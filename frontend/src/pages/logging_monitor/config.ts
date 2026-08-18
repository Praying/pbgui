import { getBoot } from '@/shared/boot';

/** Same-origin REST base for the authenticated Logging Monitor API. */
export function loggingApiBase(): string {
  return `${getBoot().origin}/api/logging`;
}

/** WebSocket origin consumed by the shared LogViewerPanel global. */
export function loggingWsBase(): string {
  return getBoot().origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}
