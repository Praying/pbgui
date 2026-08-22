/**
 * Pure formatting/color helpers ported 1:1 from dashboard_render.js
 * (tweColor:372, upnlColor:373, positionEntryColor:375-382, liveAgeText:383-390,
 * positionsStatusText:391-396, tweBarPct:397, signedFmt:398) plus the editor's
 * badge/source label helpers (_setBadge/_sourceLabel/_ageLabel/_setSourceStatus,
 * dashboard_editor.html:1039-1068).
 *
 * All globals (Date.now, PBGuiI18n) are isolated: the clock is an optional
 * parameter and translation goes through dashT, which degrades to the English
 * fallback literals — the exact legacy fallback path.
 */
import { dashT } from './i18n';

/** TWE value → color: <100 green, <200 orange, else red. */
export function tweColor(v: number): string {
  return v < 100 ? '#46c88f' : v < 200 ? '#e0a458' : '#e5615c';
}

/** uPnL ≥ 0 green, else red. */
export function upnlColor(v: number): string {
  return v >= 0 ? '#46c88f' : '#e5615c';
}

/** Entry-price line color: gray without an entry, profit/loss aware with one. */
export function positionEntryColor(
  lastPrice: number,
  entryPrice: number | null | undefined,
  side?: string | null
): string {
  if (!entryPrice) return '#a3adc2';
  const normalizedSide = String(side || 'long').toLowerCase();
  const isProfit = normalizedSide === 'short' ? lastPrice <= entryPrice : lastPrice >= entryPrice;
  return isProfit ? '#46c88f' : '#e5615c';
}

/** "now" / "5s ago" / "2m ago" / "1h ago" — legacy ts || now quirk preserved. */
export function liveAgeText(ts?: number | null, now: number = Date.now()): string {
  const age = Math.max(0, Math.round((now - (ts || now)) / 1000));
  if (age <= 1) return dashT('dash.nowShort', 'now');
  if (age < 60) return dashT('dash.secondsAgo', '{n}s ago', { n: age });
  const min = Math.floor(age / 60);
  if (min < 60) return dashT('dash.minutesAgo', '{n}m ago', { n: min });
  return dashT('dash.hoursAgo', '{n}h ago', { n: Math.floor(min / 60) });
}

/** "Live: 3s ago" / "DB fallback: …" / "Mixed live/DB: …" */
export function positionsStatusText(
  source?: string | null,
  ts?: number | null,
  now?: number
): string {
  const normalized = String(source || 'db').toLowerCase();
  let label =
    normalized === 'live' ? dashT('dash.live', 'Live') : dashT('dash.dbFallback', 'DB fallback');
  if (normalized === 'mixed') label = dashT('dash.mixedLiveDb', 'Mixed live/DB');
  return `${label}: ${liveAgeText(ts, now)}`;
}

/** TWE → bar width % (cap 100). */
export function tweBarPct(v: number): string {
  return Math.min(100, (v / 300) * 100).toFixed(1);
}

/** "+1.23" / "-1.23" */
export function signedFmt(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

/* ── editor live-poll label helpers (dashboard_editor.html:1048-1068) ── */

/** editor _sourceLabel: 'live' → Live, 'mixed' → Mixed live/DB, else DB fallback. */
export function liveSourceLabel(source?: string | null): string {
  const src = String(source || 'db').toLowerCase();
  if (src === 'live') return dashT('dash.live', 'Live');
  if (src === 'mixed') return dashT('dash.mixedLiveDb', 'Mixed live/DB');
  return dashT('dash.dbFallback', 'DB fallback');
}

/** editor _setSourceStatus text: "<label>: <age>". */
export function liveStatusText(source?: string | null, ts?: number | null, now?: number): string {
  return `${liveSourceLabel(source)}: ${liveAgeText(ts, now)}`;
}

/**
 * editor _setBadge text ("● Live · now"). lastTs === 0 means "connecting"
 * (the connection was requested but no data has arrived yet).
 */
export function liveBadgeText(lastTs: number, now: number = Date.now()): string {
  const secs = lastTs === 0 ? -1 : Math.round((now - lastTs) / 1000);
  const ageText =
    secs < 0
      ? dashT('dash.connecting', 'connecting…')
      : secs === 0
        ? dashT('dash.nowShort', 'now')
        : dashT('dash.secondsAgo', '{n}s ago', { n: secs });
  return dashT('dash.liveBadge', '● Live · {age}', { age: ageText });
}

/** editor _setSourceStatus color rule: green only for live sources. */
export function liveStatusColor(source?: string | null): string {
  return String(source || '').toLowerCase() === 'live' ? '#46c88f' : '';
}

/**
 * The legacy .dt-daterange text — "From: X  To: Y" with TWO regular spaces
 * (render.js:672, 1753, 2133, 4036 textContent assignments). Bound via
 * interpolation so the text is byte-identical (template whitespace would
 * collapse or produce non-breaking spaces).
 */
export function dateRangeText(from: string, to: string): string {
  return dashT('dash.from', 'From') + ': ' + from + '  ' + dashT('dash.to', 'To') + ': ' + to;
}
