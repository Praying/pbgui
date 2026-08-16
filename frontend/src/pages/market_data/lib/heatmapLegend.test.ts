import { describe, expect, it } from 'vitest';
import { parseHeatmapLegend } from './heatmapLegend';

/* M-data-6 — legacy set the server legend_html through innerHTML
   (:8664/:8667, :8616/:8621). The port parses the server markup into
   structured items and renders it with bound styles — raw server HTML is
   never injected (recon R1/R2 hardening). */

const SERVER_LEGEND =
  "<span style='display:inline-block;padding:6px;border-radius:4px;background:#7e57c2;color:#fff;margin-right:8px;'>market holiday</span>" +
  "<span style='display:inline-block;padding:6px;border-radius:4px;background:#4e4e4e;color:#fff;margin-right:8px;'>expected out-of-session gap</span>" +
  "<span style='display:inline-block;padding:6px;border-radius:4px;background:#b23b3b;color:#fff;margin-right:8px;'>missing</span>";

describe('parseHeatmapLegend', () => {
  it('parses the server-generated spans into label/color items', () => {
    expect(parseHeatmapLegend(SERVER_LEGEND)).toEqual([
      { label: 'market holiday', color: '#7e57c2' },
      { label: 'expected out-of-session gap', color: '#4e4e4e' },
      { label: 'missing', color: '#b23b3b' },
    ]);
  });

  it('parses double-quoted server markup as well', () => {
    const html = '<span style="background:#1e88e5;">l2Book_mid</span>';
    expect(parseHeatmapLegend(html)).toEqual([{ label: 'l2Book_mid', color: '#1e88e5' }]);
  });

  it('returns an empty array for empty or non-string input', () => {
    expect(parseHeatmapLegend('')).toEqual([]);
    expect(parseHeatmapLegend(null)).toEqual([]);
    expect(parseHeatmapLegend(undefined)).toEqual([]);
    expect(parseHeatmapLegend(42)).toEqual([]);
  });

  it('drops items whose color is not a plain hex literal', () => {
    const html =
      '<span style=\'background:red;\'>red</span>' +
      '<span style=\'background:rgb(1,2,3);\'>rgb</span>' +
      "<span style='background:#1e88e5;'>ok</span>" +
      "<span style='border:1px;'>none</span>";
    expect(parseHeatmapLegend(html)).toEqual([{ label: 'ok', color: '#1e88e5' }]);
  });

  it('drops items that smuggle markup into the label', () => {
    const html =
      "<span style='background:#b23b3b;'><img src=x onerror=alert(1)></span>" +
      "<span style='background:#b23b3b;'>safe</span>";
    expect(parseHeatmapLegend(html)).toEqual([{ label: 'safe', color: '#b23b3b' }]);
  });

  it('drops events or url() payloads anywhere in the style', () => {
    const html =
      "<span style='background:#b23b3b;' onclick='x()'>one</span>" +
      "<span style='background:url(javascript:1);'>two</span>";
    expect(parseHeatmapLegend(html)).toEqual([]);
  });

  it('keeps unicode labels verbatim', () => {
    const html = "<span style='background:#b23b3b;'>缺 少</span>";
    expect(parseHeatmapLegend(html)).toEqual([{ label: '缺 少', color: '#b23b3b' }]);
  });
});
