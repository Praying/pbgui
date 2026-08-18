import { getBoot } from '@/shared/boot';

/** Same-origin REST and WebSocket endpoints for VPS Manager. */
export function managerApiBase(): string { return `${getBoot().origin}/api/vps-manager`; }
export function managerWsUrl(): string { return `${getBoot().origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/api/vps-manager/ws`; }
