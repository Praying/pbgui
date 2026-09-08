export function getBoot(): BootInfo {
  const b = (globalThis as { __BOOT__?: BootInfo }).__BOOT__;
  if (!b || !b.origin) throw new Error('boot.js not loaded — add <script src="/api/boot.js"></script> before the page bundle');
  return b;
}

/** Same-origin API path with the trusted ASGI mount prefix prepended. */
export function apiPath(path: string): string {
  return getBoot().base_prefix + path;
}

/**
 * WebSocket base derived from the runtime location and the trusted mount
 * prefix — never from the request host (main's reverse-proxy-safe model).
 */
export function wsOrigin(): string {
  const protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
  return protocol + location.host + getBoot().base_prefix;
}

/** Absolute page origin including the mount prefix, from the runtime location. */
export function pageOrigin(): string {
  return location.origin + getBoot().base_prefix;
}
