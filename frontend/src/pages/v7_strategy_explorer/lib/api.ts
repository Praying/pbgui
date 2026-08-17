/** Cookie-auth REST helpers — ports of apiFetch (:722-731) and the MP4
 * export blob fetch (:2961-2979). */
import type { MovieExportOptionsData } from '../types';

/** JSON fetch against the explorer router; throws body text on error. */
export function apiFetch<T = unknown>(apiBase: string, path: string, opts: RequestInit = {}): Promise<T> {
  const options = { ...opts } as RequestInit & { headers: Record<string, string> };
  options.credentials = 'same-origin';
  options.headers = { ...(opts.headers || {}) } as Record<string, string>;
  if (options.body && !options.headers['Content-Type']) options.headers['Content-Type'] = 'application/json';
  return fetch(apiBase + path, options).then((res) => {
    if (!res.ok)
      return res.text().then((text) => {
        throw new Error(text || 'HTTP ' + res.status);
      });
    return res.json() as Promise<T>;
  });
}

export interface MovieExportBlobResult {
  blob: Blob;
  filename: string;
}

/** POST /movie/export and return the MP4 blob + served filename (:2961-2979). */
export async function fetchMovieExportBlob(
  apiBase: string,
  body: Record<string, unknown>,
  fallbackFilename = 'movie.mp4',
  signal?: AbortSignal
): Promise<MovieExportBlobResult> {
  const res = await fetch(apiBase + '/movie/export', {
    method: 'POST',
    credentials: 'same-origin',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().then(
      (raw) => {
        try {
          return JSON.parse(raw).detail || raw;
        } catch {
          return raw;
        }
      },
      () => ''
    );
    throw new Error(text || 'HTTP ' + res.status);
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  let filename = fallbackFilename;
  const match = disposition.match(/filename="?([^";]+)"?/i);
  if (match && match[1]) filename = match[1];
  const blob = await res.blob();
  return { blob, filename };
}

export type MovieExportOptionsLoader = () => Promise<MovieExportOptionsData>;
