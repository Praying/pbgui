/**
 * Legacy emoji → Phosphor mapping for the widget chrome icons.
 *
 * The persisted widget metadata (lib/grid.ts WIDGET_META) and the widget
 * header props still carry the legacy emoji strings; rendering goes through
 * this map so the visible icon is a Phosphor glyph. Unknown/empty values
 * fall back to the raw text (the legacy emoji renders unchanged).
 */
import type { Component } from 'vue';
import {
  PhChartBar,
  PhClipboard,
  PhCoins,
  PhNotePencil,
  PhScales,
  PhTrendDown,
  PhTrendUp,
  PhTrophy,
} from '@phosphor-icons/vue';

export const WIDGET_PHOSPHOR_ICONS: Record<string, Component> = {
  '📊': PhChartBar,
  '📈': PhTrendUp,
  '📉': PhTrendDown,
  '💰': PhCoins,
  '🏆': PhTrophy,
  '⚖️': PhScales,
  '📋': PhClipboard,
  '📝': PhNotePencil,
};

export function widgetPhosphorIcon(icon: string | null | undefined): Component | null {
  if (!icon) return null;
  return WIDGET_PHOSPHOR_ICONS[icon] ?? null;
}
