import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { resetDashboardStore, useDashboardStore } from '../stores/dashboardStore';
import ResizeHandle from './ResizeHandle.vue';

/* Port of the cell resize handle (editor:2358-2506). */

enableAutoUnmount(afterEach);

const relayout = vi.fn();
const plotsResize = vi.fn();

function fakeCell(height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height }),
  });
  return el;
}

interface Env {
  store: ReturnType<typeof useDashboardStore>;
  parent: { postMessage: ReturnType<typeof vi.fn> };
  cell: HTMLElement;
}

function setup(options: { viewOnly?: boolean; height?: number } = {}): Env {
  const parent = { postMessage: vi.fn() };
  const store = useDashboardStore({
    apiBase: '/api',
    origName: '',
    viewOnly: options.viewOnly ?? false,
    standalone: false,
    parentWindow: () => parent as unknown as Window,
  });
  const cell = fakeCell(options.height ?? 500);
  mount(ResizeHandle, {
    props: { row: 1, col: 2, cellElement: cell },
    attachTo: document.body,
  });
  return { store, parent, cell };
}

let rafCallbacks: FrameRequestCallback[] = [];

beforeEach(() => {
  resetDashboardStore();
  relayout.mockReset();
  plotsResize.mockReset();
  rafCallbacks = [];
  (window as unknown as { Plotly: unknown }).Plotly = {
    relayout,
    Plots: { resize: plotsResize },
  };
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { Plotly?: unknown }).Plotly;
});

function flushRaf(): void {
  const cbs = rafCallbacks.splice(0);
  cbs.forEach((cb) => cb(0));
}

describe('ResizeHandle', () => {
  it('renders the handle with buttons and legacy titles/labels', () => {
    setup();
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: null },
      attachTo: document.body,
    });
    expect(w.get('.resize-handle').attributes('title')).toBe('Drag to resize');
    expect(w.get('.resize-btn-min').text()).toBe('⋖ min');
    expect(w.get('.resize-btn-min').attributes('title')).toBe('Collapse to compact (scrollable)');
    expect(w.get('.resize-btn-max').text()).toBe('max ⋗');
    expect(w.get('.resize-btn-max').attributes('title')).toBe('Expand to show all rows');
  });

  it('starts the drag: anchors liveHeight, posts resize_start, freezes table wraps', async () => {
    const env = setup();
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: env.cell },
      attachTo: document.body,
    });
    const wrap = document.createElement('div');
    wrap.className = 'dp-table-wrap';
    wrap.style.overflowY = 'auto';
    env.cell.appendChild(wrap);

    await w.get('.resize-handle').trigger('mousedown', { clientY: 300 });
    expect(env.parent.postMessage).toHaveBeenCalledWith({ type: 'pbgui_resize_start' }, '*');
    expect(w.get('.resize-handle').classes()).toContain('active');
    expect((w.emitted('update:liveHeight') as number[][])[0]).toEqual([500]);
    expect(wrap.style.overflowY).toBe('hidden');

    document.dispatchEvent(new MouseEvent('mouseup', { clientY: 300 }));
    await nextTick();
    expect(wrap.style.overflowY).toBe('auto'); // restored
    expect(env.parent.postMessage).toHaveBeenCalledWith({ type: 'pbgui_resize_end' }, '*');
  });

  it('clamps the live height to the 120 px minimum during the drag', async () => {
    setup();
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: fakeCell(500) },
      attachTo: document.body,
    });
    await w.get('.resize-handle').trigger('mousedown', { clientY: 300 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: -200 })); // 500 + (-500) → clamp
    const emitted = w.emitted('update:liveHeight') as number[][];
    expect(emitted[emitted.length - 1]).toEqual([120]);
  });

  it('persists the final height on mouseup and removes auto-height', async () => {
    const env = setup();
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: fakeCell(500) },
      attachTo: document.body,
    });
    env.store.resetCellHeight(1, 1);
    expect(env.store.isAutoHeight(1, 1)).toBe(true);
    await w.get('.resize-handle').trigger('mousedown', { clientY: 300 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 420 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientY: 420 }));
    await nextTick();
    expect(env.store.state['dashboard_height_1_1']).toBe(620);
    expect(env.store.cellHeight(1, 1)).toBe(620);
    expect(env.store.isAutoHeight(1, 1)).toBe(false);
    const emitted = w.emitted('update:liveHeight') as (number | null)[][];
    expect(emitted[emitted.length - 1]).toEqual([null]); // released
  });

  it('clamps the persisted final height to 120', async () => {
    const env = setup();
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: fakeCell(500) },
      attachTo: document.body,
    });
    await w.get('.resize-handle').trigger('mousedown', { clientY: 300 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: -700 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientY: -700 }));
    await nextTick();
    expect(env.store.state['dashboard_height_1_1']).toBe(120);
  });

  it('runs the Plotly resize loop via rAF during drag and after release', async () => {
    setup();
    const cell = fakeCell(500);
    const chart = document.createElement('div');
    chart.className = 'dt-chart';
    const plot = document.createElement('div');
    plot.className = 'js-plotly-plot';
    chart.appendChild(plot);
    Object.defineProperty(chart, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ height: 400 }),
    });
    cell.appendChild(chart);
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: cell },
      attachTo: document.body,
    });
    await w.get('.resize-handle').trigger('mousedown', { clientY: 300 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 310 }));
    flushRaf();
    expect(relayout).toHaveBeenCalledWith(plot, { height: 400 });
  });

  it('marks the view dirty instead of syncing in view mode', async () => {
    const env = setup({ viewOnly: true });
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: fakeCell(500) },
      attachTo: document.body,
    });
    await w.get('.resize-handle').trigger('mousedown', { clientY: 300 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientY: 400 }));
    await nextTick();
    expect(env.parent.postMessage).toHaveBeenCalledWith({ type: 'pbgui_view_dirty' }, '*');
    expect(env.store.state['dashboard_height_1_1']).toBe(600);
  });

  it('double-click resets to auto-height (deletes the persisted key)', async () => {
    const env = setup();
    env.store.setCellHeight(1, 1, 480);
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: fakeCell(480) },
      attachTo: document.body,
    });
    await w.get('.resize-handle').trigger('dblclick');
    expect(env.store.state['dashboard_height_1_1']).toBeUndefined();
    expect(env.store.isAutoHeight(1, 1)).toBe(true);
  });

  it('Min stores 200 px; Max resets to auto-height', async () => {
    const env = setup();
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: fakeCell(500) },
      attachTo: document.body,
    });
    await w.get('.resize-btn-min').trigger('click');
    expect(env.store.state['dashboard_height_1_1']).toBe(200);
    expect(env.store.isAutoHeight(1, 1)).toBe(false);
    await w.get('.resize-btn-max').trigger('click');
    expect(env.store.state['dashboard_height_1_1']).toBeUndefined();
    expect(env.store.isAutoHeight(1, 1)).toBe(true);
  });

  it('cleans up document listeners on unmount mid-drag', async () => {
    setup();
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: fakeCell(500) },
      attachTo: document.body,
    });
    await w.get('.resize-handle').trigger('mousedown', { clientY: 300 });
    w.unmount();
    /* no listeners left → mousemove/mouseup are no-ops, no crash */
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientY: 400 }));
    await nextTick();
  });

  it('does nothing on mousedown without a cell element', async () => {
    const env = setup();
    const w = mount(ResizeHandle, {
      props: { row: 1, col: 1, cellElement: null },
      attachTo: document.body,
    });
    await w.get('.resize-handle').trigger('mousedown', { clientY: 300 });
    expect(env.parent.postMessage).not.toHaveBeenCalled();
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }));
    expect(w.emitted('update:liveHeight')).toBeUndefined();
  });
});
