/**
 * CMC pool transport + mutation state machine, ported 1:1 from the legacy
 * frontend/services_monitor.html script (cmcFetch/newCmcOperationId/
 * sameCmcMutation/clearCmcMutationContext/cancelCmcMutationContext/
 * cmcMutationOptions/resolvePendingCmcMutation/cmcMutationFetch and the
 * cmcNumber/cmcDuration/cmcTimestamp formatters).
 *
 * cmcFetch is separate from the shared apiFetch because the CMC endpoints
 * wrap errors as {detail: {message, operation_id}} - the operation id drives
 * the whole retry/resolve flow and must survive onto the thrown error.
 */
import { getBoot } from '@/shared/boot';
import { apiBase } from './config';

/** Legacy cmcFetch error: carries the HTTP status and embedded operation id. */
export class CmcApiError extends Error {
  constructor(message: string, public status: number, public operationId: string) {
    super(message);
    this.name = 'CmcApiError';
  }
}

/** Legacy authOptions: plain-object headers with the bearer token merged in. */
function authOptions(options: RequestInit = {}): RequestInit {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  const token = getBoot().token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return { ...options, headers };
}

/** Legacy cmcFetch: unwrap detail objects, expose status + operation_id. */
export async function cmcFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(apiBase() + path, authOptions(options));
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Legacy fallback chain: falsy details (empty string, 0, …) fall through too.
    let detail: unknown = (data as { detail?: unknown }).detail || (data as { error?: unknown }).error || 'CMC pool request failed.';
    let operationId = '';
    if (detail && typeof detail === 'object') {
      operationId = String((detail as { operation_id?: unknown }).operation_id ?? '');
      detail =
        String((detail as { message?: unknown }).message ?? 'CMC pool request failed.') +
        (operationId ? ` (operation ${operationId})` : '');
    }
    throw new CmcApiError(String(detail), response.status, operationId);
  }
  return data as T;
}

/** Legacy newCmcOperationId: crypto UUID with a time/random fallback. */
export function newCmcOperationId(prefix = 'cmc'): string {
  return window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Legacy cmcNumber: locale-formatted number, '-' for missing/unparsable. */
export function cmcNumber(value: unknown): string {
  if (value == null || value === '') return '-';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : '-';
}

/** Legacy cmcDuration: seconds rendered as s/m/h, '-' for zero/missing. */
export function cmcDuration(value: unknown): string {
  const seconds = Math.max(0, Number(value) || 0);
  if (!seconds) return '-';
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.ceil(seconds)}s`;
}

/** Legacy cmcTimestamp: epoch seconds/ms or parsable strings, passthrough junk. */
export function cmcTimestamp(value: unknown): string {
  if (value == null || value === '') return '-';
  const numeric = Number(value);
  const ms = Number.isFinite(numeric) ? (numeric < 100000000000 ? numeric * 1000 : numeric) : value;
  const date = new Date(ms as string | number | Date);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

/** One mutation attempt (legacy cmcMutationFetch candidate object). */
export interface CmcMutationCandidate {
  operationId: string;
  action: string;
  target: string;
  path: string;
  method: string;
  transport: 'body' | 'query';
  /** Body-side identifier key; defaults to operation_id (request_id for transfers). */
  identifierField?: string;
  body?: Record<string, unknown>;
  /** Owning modal ('' for toolbar mutations) - scopes cancel/clear semantics. */
  modal: '' | 'key' | 'authority';
  /** Secret typed into the key modal; cleared from the input on clean completion. */
  secretValue?: string;
}

export interface CmcMutationHooks {
  /** Legacy setCmcMutationBusy: flip the reactive busy flag + button states. */
  onBusyChange(busy: boolean): void;
  /** Legacy clearCmcMutationContext(ctx, true): wipe the modal secret if unchanged. */
  clearSecret(context: CmcMutationCandidate): void;
  /** Legacy operation-id bookkeeping when a pending context is cleared. */
  onContextCleared(context: CmcMutationCandidate): void;
  /** Legacy loadCmcPool() fired when a foreign completed operation refreshes the pool. */
  onRefresh(): void;
}

export interface CmcMutationControl {
  /** Legacy cmcMutationFetch. */
  run(candidate: CmcMutationCandidate): Promise<unknown>;
  /** Legacy cancelCmcMutationContext: drop a pending context of the given modal. */
  cancel(modal: 'key' | 'authority'): void;
}

function supersededError(): Error {
  return new DOMException('Superseded CMC mutation', 'AbortError');
}

/** Legacy sameCmcMutation: identity of a retry candidate vs the pending one. */
function sameMutation(left: CmcMutationCandidate, right: CmcMutationCandidate): boolean {
  return (
    !!left &&
    !!right &&
    left.action === right.action &&
    left.target === right.target &&
    left.path === right.path &&
    left.method === right.method &&
    left.transport === right.transport &&
    JSON.stringify(left.body ?? {}) === JSON.stringify(right.body ?? {})
  );
}

/**
 * Legacy mutation engine singleton-per-panel: a remembered pending operation
 * that survives navigation/refreshes, resolved against
 * GET /cmc-pool/operations/{id} before anything is sent.
 */
export function createCmcMutationControl(hooks: CmcMutationHooks): CmcMutationControl {
  let pending: CmcMutationCandidate | null = null;
  let generation = 0;
  let busy = false;

  function setBusy(value: boolean): void {
    busy = value;
    hooks.onBusyChange(busy);
  }

  function clearContext(context: CmcMutationCandidate, clearSecret: boolean): void {
    if (!context) return;
    if (clearSecret) hooks.clearSecret(context);
    if (pending === context) pending = null;
    hooks.onContextCleared(context);
  }

  /** Legacy cmcMutationOptions: fold the operation id into query or body. */
  function requestFor(context: CmcMutationCandidate): { path: string; options: RequestInit } {
    let path = context.path;
    const options: RequestInit = { method: context.method };
    const identifierField = context.identifierField ?? 'operation_id';
    if (context.transport === 'query') {
      path += (path.includes('?') ? '&' : '?') + `${encodeURIComponent(identifierField)}=${encodeURIComponent(context.operationId)}`;
    } else {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify({ ...(context.body ?? {}), [identifierField]: context.operationId });
    }
    return { path, options };
  }

  /** Legacy resolvePendingCmcMutation (pending is snapshotted like the legacy local var). */
  function resolvePending(candidate: CmcMutationCandidate): Promise<{ context: CmcMutationCandidate; payload: unknown }> {
    const remembered = pending;
    if (!remembered) {
      pending = candidate;
      return Promise.resolve({ context: candidate, payload: null });
    }
    const same = sameMutation(remembered, candidate);
    return cmcFetch(`/cmc-pool/operations/${encodeURIComponent(remembered.operationId)}`, { cache: 'no-store' })
      .then((record) => {
        const operation = record as { status?: string; result?: unknown };
        if (operation.status === 'complete' && operation.result && typeof operation.result === 'object') {
          clearContext(remembered, true);
          if (same) return { context: remembered, payload: operation.result };
          hooks.onRefresh();
          throw new Error(
            `Previous CMC operation ${remembered.operationId} completed. Review the refreshed pool, then retry this action.`
          );
        }
        if (!same) {
          throw new Error(
            `CMC operation ${remembered.operationId} is still pending. Retry or explicitly cancel that action before starting another mutation.`
          );
        }
        return { context: remembered, payload: null };
      })
      .catch((error: unknown) => {
        if (!(error instanceof CmcApiError) || error.status !== 404) throw error;
        if (same) return { context: remembered, payload: null };
        clearContext(remembered, false);
        pending = candidate;
        return { context: candidate, payload: null };
      });
  }

  return {
    run(candidate) {
      if (busy) return Promise.reject(new Error('Another credential mutation is already in progress.'));
      const runGeneration = ++generation;
      setBusy(true);
      return resolvePending(candidate)
        .then((resolved) => {
          if (runGeneration !== generation) throw supersededError();
          if (resolved.payload) return resolved.payload;
          const request = requestFor(resolved.context);
          return cmcFetch(request.path, request.options).then((data) => {
            if (runGeneration !== generation) throw supersededError();
            clearContext(resolved.context, true);
            return data;
          }).catch((error: unknown) => {
            if (error instanceof CmcApiError && error.status < 500 && error.status !== 409) {
              clearContext(resolved.context, false);
            }
            throw error;
          });
        })
        .catch((error: unknown) => {
          const err = error as Error;
          if (pending && err?.name !== 'AbortError' && !err?.message.includes('Retry will check operation')) {
            err.message += ` Retry will check operation ${pending.operationId} before sending anything.`;
          }
          throw error;
        })
        .finally(() => {
          if (runGeneration === generation) setBusy(false);
        });
    },
    cancel(modal) {
      if (pending && pending.modal === modal) clearContext(pending, false);
    },
  };
}
