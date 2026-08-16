/**
 * Pure job-formatting helpers ported verbatim from hl_data_actions.html:
 * calcPct :2025-2030, fmtBytes :2031-2036, fmtTS :2037-2043,
 * compareActiveJobs :2044-2052, fmtDay :634, inputToDay :635,
 * formatJobDuration :1821-1832, buildDateValueToMs :1288-1299.
 */

export function calcPct(pr: { step?: number; total?: number; chunk_done?: number; chunk_total?: number }): number {
  if (!pr.total) return 0;
  const s = pr.step || 0;
  const cD = pr.chunk_done || 0;
  const cT = pr.chunk_total || 1;
  const frac = cT > 0 ? cD / cT : 0;
  return Math.min(100, Math.max(0, Math.round(((s - 1 + frac) / pr.total) * 100)));
}

export function fmtBytes(b: unknown): string {
  if (!b) return '0 B';
  const num = Number(b);
  const k = 1024;
  const sz = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(num) / Math.log(k));
  return (num / Math.pow(k, i)).toFixed(2) + ' ' + sz[i];
}

export function fmtTS(ts: unknown): string {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  if (isNaN(d.getTime())) return String(ts);
  function p(n: number): string {
    return String(n).padStart(2, '0');
  }
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
  );
}

/** running first, then oldest created, then id (:2044-2052). */
export function compareActiveJobs(a: { status?: string; created_ts?: unknown; id?: string }, b: { status?: string; created_ts?: unknown; id?: string }): number {
  const aRunning = !!(a && a.status === 'running');
  const bRunning = !!(b && b.status === 'running');
  if (aRunning !== bRunning) return aRunning ? -1 : 1;
  const aCreated = parseFloat(String(a && a.created_ts || 0));
  const bCreated = parseFloat(String(b && b.created_ts || 0));
  if (aCreated !== bCreated) return aCreated - bCreated;
  return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
}

/** '20240102' → '2024-01-02'; anything else → '' (fmtDay :634). */
export function fmtDay(d: unknown): string {
  const value = String(d == null ? '' : d);
  return !d || value.length !== 8 ? '' : value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8);
}

/** '2024-01-02' → '20240102' (inputToDay :635). */
export function inputToDay(v: unknown): string {
  return v ? String(v).replace(/-/g, '') : '';
}

export function formatJobDuration(job: { created_ts?: unknown; updated_ts?: unknown }): string {
  const createdTs = parseFloat(String(job && job.created_ts || 0));
  const updatedTs = parseFloat(String(job && job.updated_ts || 0));
  if (!(createdTs > 0) || !(updatedTs >= createdTs)) return '';
  const duration = Math.round(updatedTs - createdTs);
  const hh = Math.floor(duration / 3600);
  const mm = Math.floor((duration % 3600) / 60);
  const ss = duration % 60;
  if (hh > 0) return hh + 'h ' + String(mm).padStart(2, '0') + 'm';
  if (mm > 0) return mm + 'm ' + String(ss).padStart(2, '0') + 's';
  return ss + 's';
}

/**
 * buildDateValueToMs (:1288-1299) — 'now' → today midnight, else yyyy-mm-dd.
 * The native date inputs cannot produce 'now' anymore (inline calendar
 * dropped); the parsing keeps the legacy special value for stored drafts.
 */
export function buildDateValueToMs(value: unknown): number | null {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'now') {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}
