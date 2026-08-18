import { describe, expect, it, vi } from 'vitest';
import { readNdjsonStream } from './ndjsonStream';

/*
 * apiFetchNdjson's stream half (v7_backtest.html:1191-1230): line-split
 * NDJSON pumping, per-line JSON.parse, the `done` terminal event capture
 * and the !ok → detail error path.
 */

function streamResponse(chunks: string[], ok = true, statusText = ''): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: ok ? 200 : 500, statusText });
}

function minimal(response: Response): Parameters<typeof readNdjsonStream>[0] {
  return { ok: response.ok, statusText: response.statusText, body: response.body, json: () => response.clone().json() };
}

describe('readNdjsonStream', () => {
  it('emits each line and resolves the done event', async () => {
    const events: unknown[] = [];
    const done = await readNdjsonStream(
      minimal(streamResponse(['{"type":"status","message":"a"}\n{"type":"output",', '"message":"b"}\n{"type":"done","ok":true,"results":[]}\n'])),
      (event) => events.push(event)
    );
    expect(events).toEqual([
      { type: 'status', message: 'a' },
      { type: 'output', message: 'b' },
      { type: 'done', ok: true, results: [] }, // the done line is forwarded too (:1213)
    ]);
    expect(done).toEqual({ type: 'done', ok: true, results: [] });
  });

  it('handles a final line without a trailing newline', async () => {
    const done = await readNdjsonStream(minimal(streamResponse(['{"type":"done","ok":false,"error":"x"}'])), () => undefined);
    expect(done).toEqual({ type: 'done', ok: false, error: 'x' });
  });

  it('resolves null when no done event arrives', async () => {
    const done = await readNdjsonStream(minimal(streamResponse(['{"type":"status"}\n'])), () => undefined);
    expect(done).toBeNull();
  });

  it('skips blank lines', async () => {
    const events: unknown[] = [];
    await readNdjsonStream(minimal(streamResponse(['\n\n{"type":"status"}\n\n'])), (event) => events.push(event));
    expect(events).toEqual([{ type: 'status' }]);
  });

  it('throws the parsed detail on a non-ok response', async () => {
    const response = new Response(JSON.stringify({ detail: 'denied' }), { status: 403, statusText: 'Forbidden' });
    await expect(readNdjsonStream(minimal(response), () => undefined)).rejects.toThrow('denied');
  });

  it('falls back to statusText when the error body has no detail', async () => {
    const response = new Response('nope', { status: 500, statusText: 'Internal Server Error' });
    await expect(readNdjsonStream(minimal(response), () => undefined)).rejects.toThrow('Internal Server Error');
  });

  it('throws when the browser cannot stream', async () => {
    const events = vi.fn();
    await expect(readNdjsonStream({ ok: true, statusText: '', body: null, json: async () => ({}) }, events)).rejects.toThrow(
      'Streaming is not supported by this browser'
    );
    expect(events).not.toHaveBeenCalled();
  });
});
