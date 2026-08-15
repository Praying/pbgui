/**
 * Widget registry — the recon's circularity resolution: D-2 ships EmptyCell
 * stubs for every renderable type; D-editor-4..7 call registerWidget() to
 * replace their stub, and D-editor-3's WS orchestration dispatches through
 * this map.
 */
import type { Component } from 'vue';
import EmptyCell from './components/widgets/EmptyCell.vue';
import { PALETTE_TYPES, type RenderableWidgetType } from './lib/grid';

const registry: Record<RenderableWidgetType, Component> = Object.fromEntries(
  PALETTE_TYPES.map((t) => [t, EmptyCell])
) as unknown as Record<RenderableWidgetType, Component>;

/** Replace a stub with a real widget component (D-4..7). */
export function registerWidget(type: RenderableWidgetType, component: Component): void {
  registry[type] = component;
}

/** The component for a renderable type — EmptyCell until replaced. */
export function widgetComponent(type: RenderableWidgetType): Component {
  return registry[type] ?? EmptyCell;
}
