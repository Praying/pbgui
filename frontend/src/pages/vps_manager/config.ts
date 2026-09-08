import { getBoot, wsOrigin } from '@/shared/boot';

/** Same-origin REST and WebSocket endpoints for VPS Manager. */
export function managerApiBase(): string { return `${getBoot().base_prefix}/api/vps-manager`; }
export function managerWsUrl(): string { return `${wsOrigin()}/api/vps-manager/ws`; }
