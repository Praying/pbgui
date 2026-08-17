import { deepGet, esc, fmt } from './format';
import type { CompareData, CompareRow } from '../types';

/** Source display labels for the compare tables (:1223-1248). */
export function compareSourceLabels(isV8: boolean, data: CompareData | null, compareBaselineAvailable: boolean): Record<string, string> {
  const raw = (data && data.sources) || deepGet<unknown>(data || {}, ['summary', 'sources'], null);
  const labels: Record<string, string> = isV8
    ? { pb7: 'Stored PB8 Result', b: 'Fresh PB8 Replay', c: 'PB8 Native Replay', stored: 'Stored PB8 Result', fresh: 'Fresh PB8 Replay' }
    : { pb7: 'PB7 Backtest Result', b: 'PBGui Simulation', c: 'PB7 Backtest Engine' };
  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (typeof item === 'string') labels[item] = item;
      else if (item && item.key) labels[item.key] = String(item.label || item.key);
    });
  } else if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach((key) => {
      const item = (raw as Record<string, unknown>)[key];
      labels[key] = String(item && typeof item === 'object' ? ((item as { label?: string }).label || key) : (item || key));
    });
  }
  if (isV8 && raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, 'pb7')) {
      labels.pb7 = 'Stored PB8 Result';
      if (Object.prototype.hasOwnProperty.call(obj, 'c')) labels.c = 'Fresh PB8 Replay';
    } else if (Object.prototype.hasOwnProperty.call(obj, 'b') && Object.prototype.hasOwnProperty.call(obj, 'c')) {
      labels.b = compareBaselineAvailable ? 'Current PB8 Config' : 'PB8 Native Replay A';
      labels.c = compareBaselineAvailable ? 'Pinned PB8 Baseline' : 'PB8 Native Replay B';
    } else if (Object.prototype.hasOwnProperty.call(obj, 'c')) {
      labels.c = 'Fresh PB8 Replay';
    }
  }
  return labels;
}

export interface CompareStatusModel {
  statuses: string[];
  labels: Record<string, string>;
}

/** Status order + labels for the summary table (:1249-1290). */
export function compareStatusesAndLabels(
  isV8: boolean,
  summary: CompareData['summary'] | null,
  data: CompareData | null,
  compareBaselineAvailable: boolean
): CompareStatusModel {
  const sides = ['long', 'short'];
  let statuses = ['match', 'pb7_only', 'b_only', 'c_only', 'pb7_and_b', 'pb7_and_c', 'b_and_c', 'mismatch'];
  const labels: Record<string, string> = isV8
    ? {
        match: 'Match',
        pb7_only: 'Stored PB8 Result only',
        b_only: 'Fresh PB8 Replay only',
        c_only: 'PB8 Native Replay only',
        pb7_and_b: 'Stored + Fresh PB8',
        pb7_and_c: 'Stored + Native PB8',
        b_and_c: 'Fresh + Native PB8',
        mismatch: 'Mismatch',
      }
    : {
        match: 'Match',
        pb7_only: 'PB7 Result only',
        b_only: 'PBGui Simulation only',
        c_only: 'PB7 Backtest Engine only',
        pb7_and_b: 'PB7 Result + PBGui',
        pb7_and_c: 'PB7 Result + PB7 Backtest Engine',
        b_and_c: 'PBGui Simulation + PB7 Backtest Engine',
        mismatch: 'Mismatch',
      };
  const backendLabels = (data && data.status_labels) || deepGet<Record<string, string>>(data || {}, ['summary', 'status_labels'], {});
  if (backendLabels && typeof backendLabels === 'object') {
    Object.keys(backendLabels).forEach((key) => {
      labels[key] = String(backendLabels[key]);
    });
  }
  if (data && data.sources) {
    const sourceKeys = Object.keys(data.sources || {});
    if (isV8 && sourceKeys.indexOf('pb7') >= 0 && sourceKeys.indexOf('c') >= 0) {
      statuses = ['match', 'pb7_only', 'c_only', 'pb7_and_c', 'mismatch'];
      labels.c_only = 'Fresh PB8 Replay only';
      labels.pb7_and_c = 'Stored PB8 Result + Fresh PB8 Replay';
    } else if (isV8 && sourceKeys.indexOf('b') >= 0 && sourceKeys.indexOf('c') >= 0) {
      statuses = ['match', 'b_only', 'c_only', 'b_and_c', 'mismatch'];
      labels.b_only = compareBaselineAvailable ? 'Current PB8 Config only' : 'PB8 Native Replay A only';
      labels.c_only = compareBaselineAvailable ? 'Pinned PB8 Baseline only' : 'PB8 Native Replay B only';
      labels.b_and_c = compareBaselineAvailable ? 'Current Config + Pinned Baseline' : 'PB8 Native Replay A + B';
    } else {
      const discovered: Record<string, boolean> = {};
      sides.forEach((side) => {
        const counts = ((summary || {}) as Record<string, Record<string, number>>)[side] || {};
        Object.keys(counts).forEach((key) => {
          if (Number(counts[key] || 0)) discovered[key] = true;
        });
      });
      if (Object.keys(discovered).length) statuses = Object.keys(discovered);
    }
  }
  return { statuses, labels };
}

export type CompareColumn = [key: string, label: string];

/** Row-table columns, flavour- and source-dependent (:1299-1330). */
export function compareColumns(isV8: boolean, data: CompareData | null, compareBaselineAvailable: boolean): CompareColumn[] {
  const statusLabels: Record<string, string> = isV8
    ? { pb7_only: 'Stored PB8 Result only', b_only: 'Fresh PB8 Replay only', c_only: 'PB8 Native Replay only', pb7_and_b: 'Stored + Fresh PB8', pb7_and_c: 'Stored + Native PB8', b_and_c: 'Fresh + Native PB8', match: 'Match', mismatch: 'Mismatch' }
    : { pb7_only: 'PB7 Result only', b_only: 'PBGui Simulation only', c_only: 'PB7 Backtest Engine only', pb7_and_b: 'PB7 Result + PBGui', pb7_and_c: 'PB7 Result + PB7 Backtest Engine', b_and_c: 'PBGui Simulation + PB7 Backtest Engine', match: 'Match', mismatch: 'Mismatch' };
  let cols: CompareColumn[] = [
    ['idx', '#'], ['timestamp', 'timestamp'], ['order_type', 'order_type'], ['qty', 'qty'], ['price', 'price'], ['status', 'status'],
    ['pb7_timestamp', 'pb7_timestamp'], ['pb7_order_type', 'pb7_order_type'], ['pb7_qty', 'pb7_qty'], ['pb7_price', 'pb7_price'], ['pb7_pos_size', 'pb7_pos_size'], ['pb7_pos_price', 'pb7_pos_price'], ['pb7_wallet_balance', 'pb7_wallet_balance'], ['pb7_pnl', 'pb7_pnl'], ['pb7_fee_paid', 'pb7_fee_paid'], ['pb7_wallet_exposure', 'pb7_wallet_exposure'],
    ['b_timestamp', 'pbgui_timestamp'], ['b_order_type', 'pbgui_order_type'], ['b_qty', 'pbgui_qty'], ['b_price', 'pbgui_price'], ['b_pos_size', 'pbgui_pos_size'], ['b_pos_price', 'pbgui_pos_price'], ['b_wallet_balance', 'pbgui_wallet_balance'], ['b_pnl', 'pbgui_pnl'], ['b_fee_paid', 'pbgui_fee_paid'], ['b_wallet_exposure', 'pbgui_wallet_exposure'],
    ['c_timestamp', 'engine_timestamp'], ['c_order_type', 'engine_order_type'], ['c_qty', 'engine_qty'], ['c_price', 'engine_price'], ['c_pos_size', 'engine_pos_size'], ['c_pos_price', 'engine_pos_price'], ['c_wallet_balance', 'engine_wallet_balance'], ['c_pnl', 'engine_pnl'], ['c_fee_paid', 'engine_fee_paid'], ['c_wallet_exposure', 'engine_wallet_exposure'],
    ['in_pb7', 'in_pb7'], ['in_b', 'in_pbgui'], ['in_c', 'in_engine'],
  ];
  if (isV8) {
    const sourceKeys = Object.keys((data && data.sources) || {});
    const storedVsFresh = sourceKeys.indexOf('pb7') >= 0 && sourceKeys.indexOf('c') >= 0;
    if (storedVsFresh) statusLabels.c_only = 'Fresh PB8 Replay only';
    else if (compareBaselineAvailable && sourceKeys.indexOf('b') >= 0 && sourceKeys.indexOf('c') >= 0) {
      statusLabels.b_only = 'Current PB8 Config only';
      statusLabels.c_only = 'Pinned PB8 Baseline only';
      statusLabels.b_and_c = 'Current Config + Pinned Baseline';
    }
    if (storedVsFresh) cols = cols.filter((col) => col[0].indexOf('b_') !== 0 && col[0] !== 'in_b');
    else if (sourceKeys.indexOf('b') >= 0 && sourceKeys.indexOf('c') >= 0)
      cols = cols.filter((col) => col[0].indexOf('pb7_') !== 0 && col[0] !== 'in_pb7');
    cols = cols.map((col) => {
      const replayALabel = compareBaselineAvailable ? 'current_' : 'replay_a_';
      const replayBLabel = compareBaselineAvailable ? 'pinned_' : 'replay_b_';
      let label = String(col[1]).replace(/^pb7_/, 'stored_').replace(/^pbgui_/, replayALabel);
      label = label.replace(/^engine_/, storedVsFresh ? 'fresh_' : replayBLabel);
      label = label
        .replace(/^in_pb7$/, 'in_stored')
        .replace(/^in_pbgui$/, compareBaselineAvailable ? 'in_current' : 'in_replay_a')
        .replace(/^in_engine$/, storedVsFresh ? 'in_fresh' : compareBaselineAvailable ? 'in_pinned' : 'in_replay_b');
      return [col[0], label];
    });
  }
  void statusLabels; // kept for the :1302 legacy shape; labels feed compareCellText via the caller
  return cols;
}

/** One compare-table cell as display text (:1331-1339). */
export function compareCellText(row: CompareRow, key: string, idx: number, statusLabels: Record<string, string>): string {
  if (key === 'idx') return esc(row.compare_index || idx + 1);
  let val: unknown = row[key];
  if (key === 'status') val = statusLabels[String(val)] || val;
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') return fmt(val, Math.abs(val) < 1 ? 8 : 6);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  return esc(val);
}
