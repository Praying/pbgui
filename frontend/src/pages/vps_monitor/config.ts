import { getBoot, wsOrigin } from '@/shared/boot';

/** WebSocket origin for the authenticated VPS monitor stream. */
export function vpsWsUrl(): string {
  return `${wsOrigin()}/ws/vps`;
}
