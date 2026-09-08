import { getBoot, wsOrigin } from '@/shared/boot';

/** Same-origin REST base for the authenticated Logging Monitor API. */
export function loggingApiBase(): string {
  return `${getBoot().base_prefix}/api/logging`;
}

/** WebSocket origin consumed by the shared LogViewerPanel global. */
export function loggingWsBase(): string {
  return wsOrigin();
}
