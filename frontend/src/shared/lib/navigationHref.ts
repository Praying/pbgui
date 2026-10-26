/** Resolve curated local routes without prefixing external or already-mounted URLs. */
export function resolveNavigationHref(destination: string): string {
  if (!/^\/(?:api|app)(?:\/|$)/.test(destination)) return destination;
  const boot = (globalThis as { __BOOT__?: BootInfo }).__BOOT__;
  const mountPrefix = boot?.base_prefix?.replace(/\/+$/, '') || '';
  const alreadyMounted = destination.startsWith(`${mountPrefix}/api/`)
    || destination.startsWith(`${mountPrefix}/app/`);
  if (!mountPrefix || alreadyMounted) return destination;
  return mountPrefix + destination;
}
