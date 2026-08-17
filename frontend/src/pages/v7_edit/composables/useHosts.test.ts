import { describe, expect, it, vi } from 'vitest';
import {
  buildHostQuery,
  createHostGate,
  hostOptions,
  mergeHostList,
  requestHostCapabilities,
  useHosts,
} from './useHosts';
import { createEditAdapter } from '../config';

/*
 * Host capability refresh — ports of requestHostCapabilities (:1910-1928,
 * generation + request-id guards), refreshHostCapabilities (:1930-1951),
 * populateHosts (:1953-1969) and updateEnabledOnAvailability (:1971-1985).
 */

const V7 = createEditAdapter('v7');
const V8 = createEditAdapter('v8');

describe('buildHostQuery (:1914-1918)', () => {
  it('carries the request id', () => {
    expect(buildHostQuery('req-1', { isV8: false, instanceName: '' })).toBe('?request_id=req-1');
  });

  it('adds the instance name only for v8', () => {
    expect(buildHostQuery('req-1', { isV8: true, instanceName: 'alice' })).toBe(
      '?request_id=req-1&name=alice'
    );
    expect(buildHostQuery('req-1', { isV8: false, instanceName: 'alice' })).toBe('?request_id=req-1');
    expect(buildHostQuery('req-1', { isV8: true, instanceName: '' })).toBe('?request_id=req-1');
  });
});

describe('requestHostCapabilities (:1910-1928)', () => {
  it('returns the payload on success', async () => {
    const payload = {
      request_id: 'r-1',
      hosts: ['h1'],
      host_capabilities: { h1: { pb7_capable: true } },
    };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const result = await requestHostCapabilities('http://x/api/v7', 'r-1', { isV8: false, instanceName: '' }, fetchFn as unknown as typeof fetch);
    expect(result).toEqual(payload);
    expect(fetchFn).toHaveBeenCalledWith(
      'http://x/api/v7/hosts?request_id=r-1',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('throws on a request-id mismatch (stale response, :1926)', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ request_id: 'other', hosts: [], host_capabilities: {} }), { status: 200 })
    );
    await expect(
      requestHostCapabilities('http://x/api/v7', 'r-1', { isV8: false, instanceName: '' }, fetchFn as unknown as typeof fetch)
    ).rejects.toThrow('request ID mismatch');
  });

  it('throws on HTTP errors', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 503 }));
    await expect(
      requestHostCapabilities('http://x/api/v7', 'r-1', { isV8: false, instanceName: '' }, fetchFn as unknown as typeof fetch)
    ).rejects.toThrow('HTTP 503');
  });

  it('rethrows abort errors untouched (caller ignores them, :1947-1948)', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const fetchFn = vi.fn(async () => {
      throw abort;
    });
    await expect(
      requestHostCapabilities('http://x/api/v7', 'r-1', { isV8: false, instanceName: '' }, fetchFn as unknown as typeof fetch)
    ).rejects.toBe(abort);
  });
});

describe('createHostGate (updateEnabledOnAvailability :1971-1985)', () => {
  const gate = createHostGate(V7);
  const caps = {
    h1: { pb7_capable: true },
    h2: { pb7_capable: false, pb8_capable: true },
    h3: {},
  };

  it('keeps disabled always selectable', () => {
    expect(gate.isDisabled('disabled', caps)).toBe(false);
    expect(gate.label('disabled', caps)).toBe('disabled');
  });

  it('gates on the flavour capability key', () => {
    expect(gate.isDisabled('h1', caps)).toBe(false);
    expect(gate.isDisabled('h2', caps)).toBe(true);
    expect(gate.isDisabled('h3', caps)).toBe(true);
    expect(gate.isDisabled('missing', caps)).toBe(true);
  });

  it('labels unconfirmed hosts via the i18n suffix', () => {
    expect(gate.label('h1', caps)).toBe('h1');
    expect(gate.label('h2', caps)).toBe('h2 (PB7 capability unconfirmed)');
  });

  it('v8 gates on pb8_capable', () => {
    const gate8 = createHostGate(V8);
    expect(gate8.isDisabled('h2', caps)).toBe(false);
    expect(gate8.isDisabled('h1', caps)).toBe(true);
    expect(gate8.label('h1', caps)).toBe('h1 (PB8 capability unconfirmed)');
  });
});

describe('mergeHostList (:1930-1951)', () => {
  it('replaces with the payload list and re-appends a missing selection', () => {
    expect(mergeHostList(['disabled', 'h9'], ['h1', 'h2'], 'h1')).toEqual(['h1', 'h2']);
    expect(mergeHostList(['disabled', 'h9'], ['h1', 'h2'], 'gone')).toEqual(['h1', 'h2', 'gone']);
  });

  it('keeps the previous list when the payload omits hosts entirely', () => {
    expect(mergeHostList(['disabled', 'h9'], undefined, 'h9')).toEqual(['disabled', 'h9']);
  });
});

describe('hostOptions (populateHosts :1956-1967)', () => {
  it('always renders disabled first, deduped', () => {
    expect(hostOptions(['h1', 'disabled', 'h2', 'h1'])).toEqual(['disabled', 'h1', 'h2']);
  });
});

describe('useHosts composable', () => {
  it('refreshes the list and capabilities and keeps the selection', async () => {
    const payload = {
      request_id: 'r',
      hosts: ['alpha', 'beta'],
      host_capabilities: { alpha: { pb7_capable: true } },
    };
    let calls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      calls += 1;
      const requestId = new URL(url, 'http://x').searchParams.get('request_id') ?? '';
      return new Response(JSON.stringify({ ...payload, request_id: requestId }), { status: 200 });
    });
    const hosts = useHosts('http://x/api/v7', V7, '', fetchFn as unknown as typeof fetch);
    hosts.allHosts.value = ['disabled', 'alpha'];
    hosts.selected.value = 'alpha';
    await hosts.refresh();
    expect(hosts.allHosts.value).toEqual(['alpha', 'beta']);
    expect(hosts.capabilities.value).toEqual({ alpha: { pb7_capable: true } });
    expect(hosts.selected.value).toBe('alpha');
    expect(calls).toBe(1);
  });

  it('drops a refresh whose generation was superseded (:1925)', async () => {
    let resolveFirst!: (body: unknown) => void;
    const fetchFn = vi.fn(
      (url: string) =>
        new Promise<Response>((resolve) => {
          const requestId = new URL(url, 'http://x').searchParams.get('request_id') ?? '';
          if (fetchFn.mock.calls.length === 1) {
            resolveFirst = (body) => resolve(new Response(JSON.stringify(body), { status: 200 }));
            void requestId;
          } else {
            resolve(
              new Response(JSON.stringify({ request_id: requestId, hosts: ['second'], host_capabilities: {} }), {
                status: 200,
              })
            );
          }
        })
    );
    const hosts = useHosts('http://x/api/v7', V7, '', fetchFn as unknown as typeof fetch);
    const first = hosts.refresh();
    const second = hosts.refresh();
    resolveFirst({ request_id: 'stale-but-checked', hosts: ['first'], host_capabilities: {} });
    await Promise.all([first, second]);
    expect(hosts.allHosts.value).toEqual(['second']);
    expect(hostOptions(hosts.allHosts.value)).toEqual(['disabled', 'second']);
  });

  it('swallows non-abort errors without touching the list (:1947-1950)', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 500 }));
    const hosts = useHosts('http://x/api/v7', V7, '', fetchFn as unknown as typeof fetch);
    hosts.allHosts.value = ['disabled', 'kept'];
    await hosts.refresh();
    expect(hosts.allHosts.value).toEqual(['disabled', 'kept']);
  });
});
