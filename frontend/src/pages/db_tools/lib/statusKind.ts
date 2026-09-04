import type { StatusKind } from '../composables/useDbTools';

/** setStatus ok/err tint mapping (the former db-tools.css .status.ok/.err). */
export function statusKindClass(kind: StatusKind): string {
  if (kind === 'ok') return 'ok border-success/35 text-success-soft';
  if (kind === 'err') return 'err border-danger/42 text-danger-soft';
  return '';
}
