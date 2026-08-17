/** Cookie-auth JSON fetch against the pareto router — port of the legacy
 * apiFetch (:1753-1763): throws the response body text on error. */
export function apiFetch<T = unknown>(apiBase: string, path: string, opts: RequestInit = {}): Promise<T> {
  const options = { ...opts, credentials: 'same-origin' as RequestCredentials };
  const headers = { ...(opts.headers || {}) } as Record<string, string>;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  options.headers = headers;
  return fetch(apiBase + path, options).then((res) => {
    if (!res.ok) {
      return res.text().then((text) => {
        throw new Error(text || 'HTTP ' + res.status);
      });
    }
    return res.json() as Promise<T>;
  });
}
