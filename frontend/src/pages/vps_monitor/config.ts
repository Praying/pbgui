import { getBoot } from '@/shared/boot';

/** WebSocket origin for the authenticated VPS monitor stream. */
export function vpsWsUrl(): string {
  return `${getBoot().origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws/vps`;
}
