import { describe, expect, it, vi, afterEach } from 'vitest';
import { apiFetch, ApiError } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('sends bearer token and parses json', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as Record<string, unknown>).__BOOT__ = { token: 'tk', origin: 'http://x', version: '', serial: '' };
    await expect(apiFetch('/api/x')).resolves.toEqual({ ok: true });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tk');
  });
  it('throws ApiError with detail on !ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"nope"}', { status: 400 })));
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 400, detail: 'nope' });
    try { await apiFetch('/api/x'); } catch (e) { expect(e).toBeInstanceOf(ApiError); }
  });
  it('sets Content-Type json when body present and header unset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as Record<string, unknown>).__BOOT__ = { token: 'tk', origin: 'http://x', version: '', serial: '' };
    await apiFetch('/api/x', { method: 'POST', body: '{"a":1}' });
    expect(new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers).get('Content-Type')).toBe('application/json');
  });
  it('falls back to statusText for detail when error body is not json', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 500, statusText: 'Internal Server Error' })));
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 500, detail: 'Internal Server Error' });
  });
  it('falls back to the body error field when detail is absent (legacy order detail → error → statusText)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"boom"}', { status: 500 })));
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 500, detail: 'boom' });
  });
});
