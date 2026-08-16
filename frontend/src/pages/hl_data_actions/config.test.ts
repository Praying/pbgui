import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { apiBase, apiHost, apiUrl, initialSection, jobsWsUrl } from './config';

/* Legacy plumbing: data-api-base/data-api-host were origin + /api and the
   request netloc (_render_hl_data_actions_html, api/market_data.py:1249-1262);
   the section came through the route's ?section= query. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const getBootMock = vi.mocked(getBoot);

beforeEach(() => {
  getBootMock.mockReturnValue({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' });
  window.history.replaceState({}, '', '/api/market-data/data-actions/hyperliquid');
});

describe('hl data-actions URL config', () => {
  it('derives the /api base and concatenates paths', () => {
    expect(apiBase()).toBe('http://pbgui.test:8000/api');
    expect(apiUrl('/heatmap/l2book-download-info')).toBe('http://pbgui.test:8000/api/heatmap/l2book-download-info');
    expect(apiUrl('/jobs/?states=done&limit=20&job_type=hl_best_1m')).toBe(
      'http://pbgui.test:8000/api/jobs/?states=done&limit=20&job_type=hl_best_1m'
    );
  });

  it('builds the jobs WS URL from the page protocol and host (connectWS :1645-1646)', () => {
    expect(window.location.protocol).toBe('http:');
    expect(jobsWsUrl()).toBe(`ws://${apiHost()}/ws/jobs`);
  });

  it('accepts only build|download as the initial section (:523-524)', () => {
    expect(initialSection()).toBe('');
    window.history.replaceState({}, '', '/x?section=build');
    expect(initialSection()).toBe('build');
    window.history.replaceState({}, '', '/x?section=DOWNLOAD');
    expect(initialSection()).toBe('download');
    window.history.replaceState({}, '', '/x?section=nonsense');
    expect(initialSection()).toBe('');
  });
});
