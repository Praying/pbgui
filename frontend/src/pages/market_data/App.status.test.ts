import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearAppTestGlobals,
  installFetchMock,
  flushPromises,
  mountApp,
  BASE,
} from './App.test-support';
import { pickSelectOption } from '@/shared/testing/select';

/* M-data-2 + M-data-8: the status-monitor mount (:3223-3227, :4102-4174,
   :7406-7413). The retired innerHTML fragment became the built
   market_data_status Vue page embedded as a same-origin iframe (see
   useStatusMonitor) — these are the page-level integration checks; the
   mount protocol itself is unit-tested in useStatusMonitor.test.ts and the
   shell in StatusPanel.test.ts. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({
    token: 'tok',
    origin: 'http://pbgui.test:8000',
    version: '1.0.0',
    serial: 'S1',
  })),
}));

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  clearAppTestGlobals();
});

describe('status monitor iframe mount (:3223-3227, :4142-4174, :7406-7413, M-data-8)', () => {
  it('points the frame at the restored exchange on bootstrap (:9771 → :7315)', async () => {
    const app = mountApp();
    await flushPromises();
    const frame = app.find('#status-monitor-host').element as HTMLIFrameElement;
    expect(frame.src).toBe(`${BASE}/api/market-data/status-monitor/hyperliquid`);
    expect(frame.dataset.exchange).toBe('hyperliquid');
    expect(frame.tagName).toBe('IFRAME');
  });

  it('shows the loading callout until the frame document loads (:4150-4154)', async () => {
    const app = mountApp();
    await flushPromises();
    const callout = app.find('#status-panel .callout');
    expect(callout.exists()).toBe(true);
    expect(callout.find('p').text()).toBe('Loading live market data status…');
    await app.find('#status-monitor-host').trigger('load');
    expect(app.find('#status-panel .callout').exists()).toBe(false);
  });

  it('swaps the frame src to the new exchange on change (:7315, :4148)', async () => {
    const app = mountApp();
    await flushPromises();
    const frame = app.find('#status-monitor-host').element as HTMLIFrameElement;
    await pickSelectOption(app, '#page-exchange', 'Bybit');
    await flushPromises();
    expect(frame.src).toBe(`${BASE}/api/market-data/status-monitor/bybit`);
    expect(frame.dataset.exchange).toBe('bybit');
  });

  it('does not remount when the same exchange is re-selected (:7410)', async () => {
    const app = mountApp();
    await flushPromises();
    const frame = app.find('#status-monitor-host').element as HTMLIFrameElement;
    const srcBefore = frame.src;
    await pickSelectOption(app, '#page-exchange', 'Hyperliquid');
    await flushPromises();
    expect(frame.src).toBe(srcBefore);
  });

  it('renders the warning callout when the frame navigation fails (:4166-4173)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.find('#status-monitor-host').trigger('error');
    const callout = app.find('#status-panel .callout.warning');
    expect(callout.exists()).toBe(true);
    // iframe-level failure has no HTTP detail — the generic fallback message
    expect(callout.find('p').text()).toBe('Failed to load live status monitor.');
  });

  it('unmounts cleanly with the monitor frame attached (R2)', async () => {
    const app = mountApp();
    await flushPromises();
    expect(() => app.unmount()).not.toThrow();
    expect(document.getElementById('status-monitor-host')).toBeNull();
  });
});
