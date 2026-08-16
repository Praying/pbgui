import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { helpApiBase, helpApiUrl } from './config';

/* Legacy URL plumbing: help.html fetched relative '/api/help/...' URLs
   (:722/:841/:860) while served as a static file; the Vue page rebuilds the
   base from /api/boot.js at runtime (coin_data config.ts convention). The
   /api/help/* endpoints live on the main FastAPI app (PBApiServer.py). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const getBootMock = vi.mocked(getBoot);

beforeEach(() => {
  getBootMock.mockReturnValue({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' });
});

describe('help URL bases', () => {
  it('derives the /api/help base from the boot origin', () => {
    expect(helpApiBase()).toBe('http://pbgui.test:8000/api/help');
  });

  it('joins the legacy endpoint paths onto the base', () => {
    expect(helpApiUrl('/index?lang=EN')).toBe('http://pbgui.test:8000/api/help/index?lang=EN');
    expect(helpApiUrl('/content?file=00_overview.md&lang=DE')).toBe(
      'http://pbgui.test:8000/api/help/content?file=00_overview.md&lang=DE',
    );
  });
});
