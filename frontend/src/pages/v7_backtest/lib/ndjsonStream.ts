/**
 * apiFetchNdjson's stream half (v7_backtest.html:1191-1230): line-split
 * NDJSON pumping, per-line JSON.parse, the `done` terminal event capture
 * and the !ok → parsed-detail error path. The archive base + fetch call
 * live in composables/useArchiveGit.ts.
 */

export interface NdjsonResponseLike {
  ok: boolean;
  statusText: string;
  body: ReadableStream<Uint8Array> | null;
  json(): Promise<unknown>;
}

function detailOf(data: unknown): string {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const detail = (data as { detail?: unknown }).detail;
    if (detail !== undefined && detail !== null) return String(detail);
  }
  return '';
}

/**
 * Pump the response body line by line: every non-blank line is parsed
 * and forwarded to `onEvent`; the promise resolves to the final
 * `{type:'done', …}` event or null when the stream ends without one.
 */
export async function readNdjsonStream(response: NdjsonResponseLike, onEvent: (event: unknown) => void): Promise<unknown | null> {
  if (!response.ok) {
    let detail = '';
    try {
      detail = detailOf(await response.json());
    } catch {
      /* a malformed error body falls back to the status text */
    }
    throw new Error(detail || response.statusText);
  }
  if (!response.body || typeof response.body.getReader !== 'function' || typeof TextDecoder === 'undefined') {
    throw new Error('Streaming is not supported by this browser');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalEvent: unknown = null;

  function handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed) as { type?: string };
    onEvent(event);
    if (event.type === 'done') finalEvent = event;
  }

  async function pump(): Promise<unknown | null> {
    for (;;) {
      const part = await reader.read();
      if (part.done) {
        buffer += decoder.decode();
        if (buffer.trim()) handleLine(buffer);
        return finalEvent;
      }
      buffer += decoder.decode(part.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    }
  }

  return pump();
}
