export function getBoot(): BootInfo {
  const b = (globalThis as { __BOOT__?: BootInfo }).__BOOT__;
  if (!b || !b.origin) throw new Error('boot.js not loaded — add <script src="/api/boot.js"></script> before the page bundle');
  return b;
}
