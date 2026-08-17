import { describe, expect, it } from 'vitest';
import {
  bybitPanelOrder,
  expiryBadgeClass,
  hlPanelOrder,
  userExpirySortValue,
} from './expiry';
import type { UserSummary } from '../types';

/* Provenance: renderExpiryBadge api_keys_editor.html:1475-1491, sort keys
   :1331-1347, panel orders :1752-1753 and :2095. */

describe('expiryBadgeClass (renderExpiryBadge :1475-1491)', () => {
  it('maps every legacy status to its badge class', () => {
    expect(expiryBadgeClass({ status: 'ok', days_remaining: 30 })).toBe('ok');
    expect(expiryBadgeClass({ status: 'expiring_soon', days_remaining: 5 })).toBe('expiring_soon');
    expect(expiryBadgeClass({ status: 'critical', days_remaining: 1 })).toBe('critical');
    expect(expiryBadgeClass({ status: 'expired' })).toBe('expired');
    expect(expiryBadgeClass({ status: 'no_expiry' })).toBe('no_expiry');
    expect(expiryBadgeClass({ status: 'error', error: 'boom' })).toBe('error');
  });

  it('falls back to unknown for null or unexpected statuses', () => {
    expect(expiryBadgeClass(null)).toBe('unknown');
    expect(expiryBadgeClass({ status: null })).toBe('unknown');
    expect(expiryBadgeClass({ status: 'weird' })).toBe('unknown');
  });
});

describe('userExpirySortValue (table sort :1331-1347)', () => {
  const hl: UserSummary = { name: 'hl1', exchange: 'hyperliquid', in_use: false };
  const hlStored: UserSummary = {
    name: 'hl2',
    exchange: 'hyperliquid',
    in_use: false,
    hl_days_remaining: 4,
  };
  const bybit: UserSummary = { name: 'b1', exchange: 'bybit', in_use: false };
  const other: UserSummary = { name: 'o1', exchange: 'binance', in_use: false };

  it('prefers live-fetched days over stored days for hyperliquid', () => {
    const live = { hl1: { name: 'hl1', status: 'ok' as const, days_remaining: 12, valid_until_iso: null, is_vault: false } };
    expect(userExpirySortValue(hl, live, {})).toBe(12);
  });

  it('uses stored days when no live entry exists', () => {
    expect(userExpirySortValue(hlStored, {}, {})).toBe(4);
  });

  it('null HL days sort as 9998, null bybit days as 9997, others 99999', () => {
    expect(userExpirySortValue(hl, {}, {})).toBe(9998);
    expect(userExpirySortValue(bybit, {}, {})).toBe(9997);
    expect(userExpirySortValue(other, {}, {})).toBe(99999);
  });

  it('prefers live bybit data over stored', () => {
    const live = { b1: { name: 'b1', status: 'ok' as const, days_remaining: 9, expires_at_iso: null, ips: [] } };
    expect(userExpirySortValue(bybit, {}, live)).toBe(9);
  });
});

describe('panel sort orders', () => {
  it('HL orders expired first and unknown last (:2095)', () => {
    expect(hlPanelOrder.expired).toBe(0);
    expect(hlPanelOrder.ok).toBe(2);
    expect(hlPanelOrder.error).toBe(4);
  });

  it('bybit orders expired first and unknown last (:1752-1753)', () => {
    expect(bybitPanelOrder.expired).toBe(0);
    expect(bybitPanelOrder.expiring_soon).toBe(2);
    expect(bybitPanelOrder.no_expiry).toBe(4);
  });
});
