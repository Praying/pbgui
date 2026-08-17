import { describe, expect, it, vi } from 'vitest';
import { apiFetch, fetchMovieExportBlob } from './api';

/* Cookie-auth REST access — port of apiFetch (:722-731) and the MP4 blob
   fetch (:2961-2979). The apiBase is injected like the legacy API_BASE var. */

function lastCall() {
  const c = vi.mocked(fetch).mock.calls[0]!;
  return { url: String(c[0]), init: (c[1] ?? {}) as RequestInit & { headers: Record<string, string> } };
}

describe('apiFetch (:722-731)', () => {
  it('prepends the explorer API base and sends same-origin credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('http://x/api/strategy-explorer', '/snapshot');
    const { url, init } = lastCall();
    expect(url).toBe('http://x/api/strategy-explorer/snapshot');
    expect(init.credentials).toBe('same-origin');
    vi.unstubAllGlobals();
  });

  it('adds a JSON content-type when a body is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('http://x', '/snapshot', { method: 'POST', body: '{}' });
    const { init } = lastCall();
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    vi.unstubAllGlobals();
  });

  it('returns the parsed JSON on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })));
    await expect(apiFetch('http://x', '/session')).resolves.toEqual({ ok: true });
    vi.unstubAllGlobals();
  });

  it('throws the response body text on error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    await expect(apiFetch('http://x', '/session')).rejects.toThrow('boom');
    vi.unstubAllGlobals();
  });
});

describe('fetchMovieExportBlob (:2961-2979)', () => {
  it('posts the figure and unwraps the blob + filename', async () => {
    const blob = new Blob(['mp4'], { type: 'video/mp4' });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(blob, { status: 200, headers: { 'Content-Disposition': 'attachment; filename="custom.mp4"' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchMovieExportBlob('http://x', { figure: {}, options: {}, progress_id: 'p' });
    expect(result.filename).toBe('custom.mp4');
    expect(result.blob.size).toBeGreaterThan(0); // undici blob: content check unreliable in jsdom
    expect(lastCall().init.method).toBe('POST');
    vi.unstubAllGlobals();
  });

  it('unwraps JSON detail error text (:2970-2971)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'no encoder' }), { status: 422 }))
    );
    await expect(fetchMovieExportBlob('http://x', {})).rejects.toThrow('no encoder');
    vi.unstubAllGlobals();
  });

  it('falls back to the requested filename when no disposition header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['x']), { status: 200 })));
    const result = await fetchMovieExportBlob('http://x', {}, 'fallback.mp4');
    expect(result.filename).toBe('fallback.mp4');
    vi.unstubAllGlobals();
  });
});
