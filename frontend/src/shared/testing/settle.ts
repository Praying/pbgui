import { flushPromises } from '@vue/test-utils';

/**
 * Wait until a component's async chain has gone quiet.
 *
 * `await flushPromises()` drains only the microtasks queued *right now*. A
 * widget that does fetch → res.json() → nextTick → render needs a longer
 * chain, whose depth varies with machine load. A bare flush (or two) is a
 * guess at that depth: it passes alone and fails when the suite runs in
 * parallel, and which test fails changes from run to run. That is how
 * unrelated dashboard_editor tests (WidgetOrders, WidgetIncome …) flaked.
 *
 * This drains until the observable activity stops: a macrotask turn in which
 * `fetch` was not called again and nothing else queued work. Two consecutive
 * quiet turns are required, and the loop is bounded so a chain that never
 * settles fails the assertion that follows instead of hanging the suite.
 */
/**
 * True when the global timers have been replaced by vitest's fake clock.
 * @sinonjs/fake-timers installs a `clock` handle on the patched functions;
 * real timers have none.
 */
function timersAreFake(): boolean {
  return 'clock' in (setTimeout as unknown as object);
}

export async function settle(options: { maxTurns?: number } = {}): Promise<void> {
  // Under vi.useFakeTimers() a real macrotask wait would never resolve (the
  // clock only moves when the test advances it), so there is no scheduling
  // jitter to out-wait there: draining the microtask queue is the whole job.
  if (timersAreFake()) {
    for (let turn = 0; turn < 8; turn += 1) await flushPromises();
    return;
  }
  const maxTurns = options.maxTurns ?? 25;
  const fetchCalls = (): number => {
    const f = globalThis.fetch as unknown as { mock?: { calls: unknown[] } };
    return f?.mock?.calls.length ?? 0;
  };
  let quietTurns = 0;
  let seen = fetchCalls();
  for (let turn = 0; turn < maxTurns && quietTurns < 2; turn += 1) {
    await flushPromises();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await flushPromises();
    const now = fetchCalls();
    quietTurns = now === seen ? quietTurns + 1 : 0;
    seen = now;
  }
}
